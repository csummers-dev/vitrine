package cmd

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/spf13/afero"
	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
	"github.com/spf13/viper"
	lumberjack "gopkg.in/natefinch/lumberjack.v2"

	"github.com/filebrowser/filebrowser/v2/audit"
	"github.com/filebrowser/filebrowser/v2/auth"
	"github.com/filebrowser/filebrowser/v2/diskcache"
	"github.com/filebrowser/filebrowser/v2/events"
	"github.com/filebrowser/filebrowser/v2/frontend"
	fbhttp "github.com/filebrowser/filebrowser/v2/http"
	"github.com/filebrowser/filebrowser/v2/img"
	"github.com/filebrowser/filebrowser/v2/settings"
	"github.com/filebrowser/filebrowser/v2/storage"
	"github.com/filebrowser/filebrowser/v2/tags"
	"github.com/filebrowser/filebrowser/v2/users"
	"github.com/filebrowser/filebrowser/v2/webhooks"
)

var (
	flagNamesMigrations = map[string]string{
		"file-mode":                        "fileMode",
		"dir-mode":                         "dirMode",
		"hide-login-button":                "hideLoginButton",
		"create-user-dir":                  "createUserDir",
		"minimum-password-length":          "minimumPasswordLength",
		"socket-perm":                      "socketPerm",
		"disable-thumbnails":               "disableThumbnails",
		"disable-preview-resize":           "disablePreviewResize",
		"disable-exec":                     "disableExec",
		"disable-type-detection-by-header": "disableTypeDetectionByHeader",
		"img-processors":                   "imageProcessors",
		"cache-dir":                        "cacheDir",
		"redis-cache-url":                  "redisCacheUrl",
		"token-expiration-time":            "tokenExpirationTime",
		"baseurl":                          "baseURL",
	}

	warnedFlags = map[string]bool{}
)

// TODO(remove): remove after July 2026.
func migrateFlagNames(_ *pflag.FlagSet, name string) pflag.NormalizedName {
	if newName, ok := flagNamesMigrations[name]; ok {

		if !warnedFlags[name] {
			warnedFlags[name] = true
			log.Printf("DEPRECATION NOTICE: Flag --%s has been deprecated, use --%s instead\n", name, newName)
		}

		name = newName
	}

	return pflag.NormalizedName(name)
}

func init() {
	rootCmd.SilenceUsage = true
	rootCmd.SetGlobalNormalizationFunc(migrateFlagNames)

	cobra.MousetrapHelpText = ""

	rootCmd.SetVersionTemplate("File Browser version {{printf \"%s\" .Version}}\n")

	// Flags available across the whole program
	persistent := rootCmd.PersistentFlags()
	persistent.StringP("config", "c", "", "config file path")
	persistent.StringP("database", "d", "./filebrowser.db", "database path")

	// Runtime flags for the root command
	flags := rootCmd.Flags()
	flags.Bool("noauth", false, "use the noauth auther when using quick setup")
	flags.String("username", "admin", "username for the first user when using quick setup")
	flags.String("password", "", "hashed password for the first user when using quick setup")
	flags.Uint32("socketPerm", 0666, "unix socket file permissions")
	flags.String("cacheDir", "", "file cache directory (disabled if empty)")
	flags.String("redisCacheUrl", "", "redis cache URL (for multi-instance deployments), e.g. redis://user:pass@host:port")
	flags.Int("imageProcessors", 4, "image processors count")
	addServerFlags(flags)
}

// addServerFlags adds server related flags to the given FlagSet. These flags are available
// in both the root command, config set and config init commands.
func addServerFlags(flags *pflag.FlagSet) {
	flags.StringP("address", "a", "127.0.0.1", "address to listen on")
	flags.StringP("log", "l", "stdout", "log output")
	flags.StringP("port", "p", "8080", "port to listen on")
	flags.StringP("cert", "t", "", "tls certificate")
	flags.StringP("key", "k", "", "tls key")
	flags.StringP("root", "r", ".", "root to prepend to relative paths")
	flags.String("socket", "", "socket to listen to (cannot be used with address, port, cert nor key flags)")
	flags.StringP("baseURL", "b", "", "base url")
	flags.String("tokenExpirationTime", "2h", "user session timeout")
	flags.Bool("disableThumbnails", false, "disable image thumbnails")
	flags.Bool("disablePreviewResize", false, "disable resize of image previews")
	flags.Bool("disableExec", true, "disables Command Runner feature")
	flags.Bool("disableTypeDetectionByHeader", false, "disables type detection by reading file headers")
	flags.Bool("disableImageResolutionCalc", false, "disables image resolution calculation by reading image files")
	// Zip extraction is on by default (PR #5746, fork variant). Operators
	// running on shared / untrusted hosts can flip this off with
	// `--unzipEnabled=false`; the UI exposes no toggle so end-users can't
	// disable it themselves.
	flags.Bool("unzipEnabled", true, "enable zip file extraction")
}

var rootCmd = &cobra.Command{
	Use:   "filebrowser",
	Short: "A stylish web-based file browser",
	Long: `File Browser CLI lets you create the database to use with File Browser,
manage your users and all the configurations without accessing the
web interface.

If you've never run File Browser, you'll need to have a database for
it. Don't worry: you don't need to setup a separate database server.
We're using Bolt DB which is a single file database and all managed
by ourselves.

For this command, all flags are available as environmental variables,
except for "--config", which specifies the configuration file to use.
The environment variables are prefixed by "FB_" followed by the flag name in
UPPER_SNAKE_CASE. For example, the flag "--disablePreviewResize" is available
as FB_DISABLE_PREVIEW_RESIZE.

If "--config" is not specified, File Browser will look for a configuration
file named .filebrowser.{json, toml, yaml, yml} in the following directories:

- ./
- $HOME/
- /etc/filebrowser/

**Note:** Only the options listed below can be set via the config file or
environment variables. Other configuration options live exclusively in the
database and so they must be set by the "config set" or "config
import" commands.

The precedence of the configuration values are as follows:

- Flags
- Environment variables
- Configuration file
- Database values
- Defaults

Also, if the database path doesn't exist, File Browser will enter into
the quick setup mode and a new database will be bootstrapped and a new
user created with the credentials from options "username" and "password".`,
	RunE: withViperAndStore(func(_ *cobra.Command, _ []string, v *viper.Viper, st *store) error {
		if !st.databaseExisted {
			err := quickSetup(v, st.Storage)
			if err != nil {
				return err
			}
		}

		// build img service
		imgWorkersCount := v.GetInt("imageProcessors")
		if imgWorkersCount < 1 {
			return errors.New("image resize workers count could not be < 1")
		}
		imageService := img.New(imgWorkersCount)

		var fileCache diskcache.Interface = diskcache.NewNoOp()
		cacheDir := v.GetString("cacheDir")
		if cacheDir != "" {
			if err := os.MkdirAll(cacheDir, 0700); err != nil {
				return fmt.Errorf("can't make directory %s: %w", cacheDir, err)
			}
			fileCache = diskcache.New(afero.NewOsFs(), cacheDir)
		}
		// Transcoded videos (#3) are cached on the same volume as the disk
		// cache (falls back to a temp dir when no cacheDir is configured).
		fbhttp.SetTranscodeCacheDir(cacheDir)

		redisCacheURL := v.GetString("redisCacheUrl")
		uploadCache, err := fbhttp.NewUploadCache(redisCacheURL)
		if err != nil {
			return fmt.Errorf("failed to initialize upload cache: %w", err)
		}

		// Audit log: persisted alongside the main DB so operators only
		// have one location to back up. Path derives from the main DB
		// path (filebrowser.db → filebrowser-audit.db); using a sibling
		// file rather than the main DB keeps audit growth or corruption
		// from touching authoritative user data.
		dbBase := strings.TrimSuffix(st.path, filepath.Ext(st.path))
		auditPath := dbBase + "-audit.db"
		auditLog, err := audit.New(auditPath)
		if err != nil {
			return fmt.Errorf("audit: open log: %w", err)
		}
		defer auditLog.Close()
		// Subscribe to the in-process event bus. The unsubscribe handle
		// runs on shutdown so audit doesn't keep writing after Close.
		unsubscribeAudit := auditLog.Attach(events.Subscribe)
		defer unsubscribeAudit()
		log.Println("Audit log: " + auditPath)

		// Tags store (v1.3 S2). Same sibling-file pattern as audit so
		// the operator's backup story is unchanged. The HTTP handlers
		// read this via the data struct; nil disables them with 503.
		tagsPath := dbBase + "-tags.db"
		tagsStore, err := tags.New(tagsPath)
		if err != nil {
			return fmt.Errorf("tags: open store: %w", err)
		}
		defer tagsStore.Close()
		// Subscribe to the events bus so file_tags entries follow
		// their underlying paths on rename/move/delete. FileCopied is
		// intentionally not handled (locked decision: tags don't
		// follow copies).
		unsubscribeTags := tagsStore.AttachIndexMaintainer(events.Subscribe)
		defer unsubscribeTags()
		log.Println("Tags store: " + tagsPath)

		// Webhooks (v1.3 S8-2). Sibling bolt DB for endpoint config +
		// last-delivery status; the dispatcher subscribes to the events
		// bus and POSTs file events to enabled endpoints in the
		// background.
		webhooksPath := dbBase + "-webhooks.db"
		webhookStore, err := webhooks.New(webhooksPath)
		if err != nil {
			return fmt.Errorf("webhooks: open store: %w", err)
		}
		defer webhookStore.Close()
		webhookDispatcher := webhooks.NewDispatcher(webhookStore)
		unsubscribeWebhooks := webhookDispatcher.Attach(events.Subscribe)
		defer unsubscribeWebhooks()
		log.Println("Webhooks store: " + webhooksPath)

		server, err := getServerSettings(v, st.Storage)
		if err != nil {
			return err
		}
		setupLog(server.Log)

		root, err := filepath.Abs(server.Root)
		if err != nil {
			return err
		}
		server.Root = root

		adr := server.Address + ":" + server.Port

		var listener net.Listener

		switch {
		case server.Socket != "":
			listener, err = net.Listen("unix", server.Socket)
			if err != nil {
				return err
			}
			socketPerm := v.GetUint32("socketPerm")
			err = os.Chmod(server.Socket, os.FileMode(socketPerm))
			if err != nil {
				return err
			}
		case server.TLSKey != "" && server.TLSCert != "":
			cer, err := tls.LoadX509KeyPair(server.TLSCert, server.TLSKey)
			if err != nil {
				return err
			}
			listener, err = tls.Listen("tcp", adr, &tls.Config{
				MinVersion:   tls.VersionTLS12,
				Certificates: []tls.Certificate{cer}},
			)
			if err != nil {
				return err
			}
		default:
			listener, err = net.Listen("tcp", adr)
			if err != nil {
				return err
			}
		}

		assetsFs, err := fs.Sub(frontend.Assets(), "dist")
		if err != nil {
			panic(err)
		}

		handler, err := fbhttp.NewHandler(imageService, fileCache, uploadCache, st.Storage, tagsStore, auditLog, webhookStore, webhookDispatcher, server, assetsFs)
		if err != nil {
			return err
		}

		defer listener.Close()

		log.Println("Listening on", listener.Addr().String())
		srv := &http.Server{
			Handler:           handler,
			ReadHeaderTimeout: 60 * time.Second,
		}

		go func() {
			if err := srv.Serve(listener); !errors.Is(err, http.ErrServerClosed) {
				log.Fatalf("HTTP server error: %v", err)
			}

			log.Println("Stopped serving new connections.")
		}()

		sigc := make(chan os.Signal, 1)
		signal.Notify(sigc,
			os.Interrupt,
			syscall.SIGHUP,
			syscall.SIGINT,
			syscall.SIGTERM,
			syscall.SIGQUIT,
		)
		sig := <-sigc
		log.Println("Got signal:", sig)

		shutdownCtx, shutdownRelease := context.WithTimeout(context.Background(), 10*time.Second)
		defer shutdownRelease()

		if err := srv.Shutdown(shutdownCtx); err != nil {
			log.Fatalf("HTTP shutdown error: %v", err)
		}
		log.Println("Graceful shutdown complete.")

		return nil
	}, storeOptions{allowsNoDatabase: true}),
}

func getServerSettings(v *viper.Viper, st *storage.Storage) (*settings.Server, error) {
	server, err := st.Settings.GetServer()
	if err != nil {
		return nil, err
	}

	isSocketSet := false
	isAddrSet := false

	if v.IsSet("address") {
		server.Address = v.GetString("address")
		isAddrSet = true
	}

	if v.IsSet("log") {
		server.Log = v.GetString("log")
	}

	if v.IsSet("port") {
		server.Port = v.GetString("port")
		isAddrSet = true
	}

	if v.IsSet("cert") {
		server.TLSCert = v.GetString("cert")
		isAddrSet = true
	}

	if v.IsSet("key") {
		server.TLSKey = v.GetString("key")
		isAddrSet = true
	}

	if v.IsSet("root") {
		server.Root = v.GetString("root")
	}

	if v.IsSet("socket") {
		server.Socket = v.GetString("socket")
		isSocketSet = true
	}

	if v.IsSet("baseURL") {
		server.BaseURL = v.GetString("baseURL")
		// TODO(remove): remove after July 2026.
	} else if v := os.Getenv("FB_BASEURL"); v != "" {
		log.Println("DEPRECATION NOTICE: Environment variable FB_BASEURL has been deprecated, use FB_BASE_URL instead")
		server.BaseURL = v
	}

	if v.IsSet("tokenExpirationTime") {
		server.TokenExpirationTime = v.GetString("tokenExpirationTime")
	}

	if v.IsSet("disableThumbnails") {
		server.EnableThumbnails = !v.GetBool("disableThumbnails")
	}

	if v.IsSet("disablePreviewResize") {
		server.ResizePreview = !v.GetBool("disablePreviewResize")
	}

	if v.IsSet("disableTypeDetectionByHeader") {
		server.TypeDetectionByHeader = !v.GetBool("disableTypeDetectionByHeader")
	}

	if v.IsSet("disableImageResolutionCalc") {
		server.ImageResolutionCal = !v.GetBool("disableImageResolutionCalc")
	}

	if v.IsSet("disableExec") {
		server.EnableExec = !v.GetBool("disableExec")
	}

	// Unzip is on by default in this fork; viper flag overrides explicit
	// settings storage value only when the operator passes the flag.
	// When neither flag nor storage has a value, leave UnzipEnabled true
	// so configs predating this feature pick up the new behavior on
	// upgrade rather than silently shipping it disabled.
	if v.IsSet("unzipEnabled") {
		server.UnzipEnabled = v.GetBool("unzipEnabled")
	} else if !server.UnzipEnabled {
		// Cover the upgrade path: an existing DB-loaded Server struct
		// with the new field at its Go zero value (false). Treat that as
		// "operator hasn't expressed an opinion" and apply the default.
		server.UnzipEnabled = true
	}

	if v.IsSet("maxZipFileSize") {
		server.MaxZipFileSize = v.GetInt64("maxZipFileSize")
	} else if server.MaxZipFileSize == 0 {
		server.MaxZipFileSize = settings.DefaultMaxZipFileSize
	}

	if v.IsSet("maxZipFileEntries") {
		server.MaxZipFileEntries = v.GetInt("maxZipFileEntries")
	} else if server.MaxZipFileEntries == 0 {
		server.MaxZipFileEntries = settings.DefaultMaxZipFileEntries
	}

	if v.IsSet("maxTotalUncompressedSize") {
		server.MaxTotalUncompressedSize = v.GetUint64("maxTotalUncompressedSize")
	} else if server.MaxTotalUncompressedSize == 0 {
		server.MaxTotalUncompressedSize = settings.DefaultMaxTotalUncompressedSize
	}

	if v.IsSet("maxUncompressedSizeRate") {
		server.MaxUncompressedSizeRate = v.GetFloat64("maxUncompressedSizeRate")
	} else if server.MaxUncompressedSizeRate == 0 {
		server.MaxUncompressedSizeRate = settings.DefaultMaxUncompressedSizeRate
	}

	if v.IsSet("maxUncompressedFileSize") {
		server.MaxUncompressedFileSize = v.GetUint64("maxUncompressedFileSize")
	} else if server.MaxUncompressedFileSize == 0 {
		server.MaxUncompressedFileSize = settings.DefaultMaxUncompressedFileSize
	}

	if isAddrSet && isSocketSet {
		return nil, errors.New("--socket flag cannot be used with --address, --port, --key nor --cert")
	}

	// Do not use saved Socket if address was manually set.
	if isAddrSet && server.Socket != "" {
		server.Socket = ""
	}

	if server.EnableExec {
		log.Println("WARNING: Command Runner feature enabled!")
		log.Println("WARNING: This feature has known security vulnerabilities and should not")
		log.Println("WARNING: you fully understand the risks involved. For more information")
		log.Println("WARNING: read https://github.com/filebrowser/filebrowser/issues/5199")
	}

	return server, nil
}

func setupLog(logMethod string) {
	switch logMethod {
	case "stdout":
		log.SetOutput(os.Stdout)
	case "stderr":
		log.SetOutput(os.Stderr)
	case "":
		log.SetOutput(io.Discard)
	default:
		log.SetOutput(&lumberjack.Logger{
			Filename:   logMethod,
			MaxSize:    100,
			MaxAge:     14,
			MaxBackups: 10,
		})
	}
}

func quickSetup(v *viper.Viper, s *storage.Storage) error {
	log.Println("Performing quick setup")

	set := &settings.Settings{
		Key:                   generateKey(),
		Signup:                false,
		HideLoginButton:       true,
		CreateUserDir:         false,
		MinimumPasswordLength: settings.DefaultMinimumPasswordLength,
		UserHomeBasePath:      settings.DefaultUsersHomeBasePath,
		Defaults: settings.UserDefaults{
			Scope:                 ".",
			SingleClick:           false,
			RedirectAfterCopyMove: true,
			Perm: users.Permissions{
				Admin:    false,
				Execute:  true,
				Create:   true,
				Rename:   true,
				Modify:   true,
				Delete:   true,
				Share:    true,
				Download: true,
			},
		},
		AuthMethod: "",
		// Default app wordmark — the frontend's <BrandName> component tints
		// the word "pretty" with the theme accent everywhere this string is
		// rendered (login header chip + heading, etc.).
		Branding: settings.Branding{Name: "filebrowser pretty"},
		Tus: settings.Tus{
			ChunkSize:  settings.DefaultTusChunkSize,
			RetryCount: settings.DefaultTusRetryCount,
		},
		Commands: nil,
		Shell:    nil,
		Rules:    nil,
	}

	var err error
	if v.GetBool("noauth") {
		set.AuthMethod = auth.MethodNoAuth
		err = s.Auth.Save(&auth.NoAuth{})
	} else {
		set.AuthMethod = auth.MethodJSONAuth
		err = s.Auth.Save(&auth.JSONAuth{})
	}
	if err != nil {
		return err
	}

	err = s.Settings.Save(set)
	if err != nil {
		return err
	}

	ser := &settings.Server{
		BaseURL:               v.GetString("baseURL"),
		Port:                  v.GetString("port"),
		Log:                   v.GetString("log"),
		TLSKey:                v.GetString("key"),
		TLSCert:               v.GetString("cert"),
		Address:               v.GetString("address"),
		Root:                  v.GetString("root"),
		TokenExpirationTime:   v.GetString("tokenExpirationTime"),
		EnableThumbnails:      !v.GetBool("disableThumbnails"),
		ResizePreview:         !v.GetBool("disablePreviewResize"),
		EnableExec:            !v.GetBool("disableExec"),
		TypeDetectionByHeader: !v.GetBool("disableTypeDetectionByHeader"),
		ImageResolutionCal:    !v.GetBool("disableImageResolutionCalc"),
		// Upstream PR used `v.GetBool("UnzipEnabled")` (TitleCase) — viper
		// normalizes keys lowercase, so that always returned false at
		// quickSetup time. Use the lowercase form like every sibling key.
		UnzipEnabled:             v.GetBool("unzipEnabled"),
		MaxZipFileSize:           settings.DefaultMaxZipFileSize,
		MaxZipFileEntries:        settings.DefaultMaxZipFileEntries,
		MaxTotalUncompressedSize: settings.DefaultMaxTotalUncompressedSize,
		MaxUncompressedSizeRate:  settings.DefaultMaxUncompressedSizeRate,
		MaxUncompressedFileSize:  settings.DefaultMaxUncompressedFileSize,
	}

	err = s.Settings.SaveServer(ser)
	if err != nil {
		return err
	}

	username := v.GetString("username")
	password := v.GetString("password")

	if password == "" {
		var pwd string
		pwd, err = users.RandomPwd(set.MinimumPasswordLength)
		if err != nil {
			return err
		}

		log.Printf("User '%s' initialized with randomly generated password: %s\n", username, pwd)
		password, err = users.ValidateAndHashPwd(pwd, set.MinimumPasswordLength)
		if err != nil {
			return err
		}
	} else {
		log.Printf("User '%s' initialize wth user-provided password\n", username)
	}

	if username == "" || password == "" {
		log.Fatal("username and password cannot be empty during quick setup")
	}

	user := &users.User{
		Username:     username,
		Password:     password,
		LockPassword: false,
	}

	set.Defaults.Apply(user)
	user.Perm.Admin = true

	return s.Users.Save(user)
}
