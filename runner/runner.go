package runner

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"strings"

	"github.com/csummers-dev/vitrine/v3/settings"
	"github.com/csummers-dev/vitrine/v3/users"
)

// Runner is a commands runner.
type Runner struct {
	Enabled bool
	*settings.Settings
}

// RunHook runs the hooks for the before and after event.
func (r *Runner) RunHook(fn func() error, evt, path, dst string, user *users.User) error {
	path = user.FullPath(path)
	dst = user.FullPath(dst)

	if r.Enabled {
		if val, ok := r.Commands["before_"+evt]; ok {
			for _, command := range val {
				err := r.exec(command, "before_"+evt, path, dst, user)
				if err != nil {
					return err
				}
			}
		}
	}

	err := fn()
	if err != nil {
		return err
	}

	if r.Enabled {
		if val, ok := r.Commands["after_"+evt]; ok {
			for _, command := range val {
				err := r.exec(command, "after_"+evt, path, dst, user)
				if err != nil {
					return err
				}
			}
		}
	}

	return nil
}

// exec runs one admin-configured event command. SECURITY (audit SEC-004): the
// command list (r.Commands) and shell choice (r.Shell) are ADMIN configuration
// and run with the SERVER's privileges. When a shell is configured, the
// user-controlled file path is os.Expand-ed into $FILE / $DESTINATION inside the
// raw shell string, so a crafted filename can inject shell syntax — admins using
// shell mode must quote "$FILE" / "$DESTINATION" in their hooks (or avoid shell
// mode). With no shell, args are passed as argv, so metacharacters are inert.
func (r *Runner) exec(raw, evt, path, dst string, user *users.User) error {
	blocking := true

	if strings.HasSuffix(raw, "&") {
		blocking = false
		raw = strings.TrimSpace(strings.TrimSuffix(raw, "&"))
	}

	command, _, err := ParseCommand(r.Settings, raw)
	if err != nil {
		return err
	}

	envMapping := func(key string) string {
		switch key {
		case "FILE":
			return path
		case "SCOPE":
			return user.Scope
		case "TRIGGER":
			return evt
		case "USERNAME":
			return user.Username
		case "DESTINATION":
			return dst
		default:
			return os.Getenv(key)
		}
	}
	for i, arg := range command {
		if i == 0 {
			continue
		}

		command[i] = os.Expand(arg, envMapping)
	}

	cmd := exec.Command(command[0], command[1:]...)
	cmd.Env = append(os.Environ(), fmt.Sprintf("FILE=%s", path))
	cmd.Env = append(cmd.Env, fmt.Sprintf("SCOPE=%s", user.Scope))
	cmd.Env = append(cmd.Env, fmt.Sprintf("TRIGGER=%s", evt))
	cmd.Env = append(cmd.Env, fmt.Sprintf("USERNAME=%s", user.Username))
	cmd.Env = append(cmd.Env, fmt.Sprintf("DESTINATION=%s", dst))

	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if !blocking {
		log.Printf("[INFO] Nonblocking Command: \"%s\"", strings.Join(command, " "))
		defer func() {
			go func() {
				err := cmd.Wait()
				if err != nil {
					log.Printf("[INFO] Nonblocking Command \"%s\" failed: %s", strings.Join(command, " "), err)
				}
			}()
		}()
		return cmd.Start()
	}

	log.Printf("[INFO] Blocking Command: \"%s\"", strings.Join(command, " "))
	return cmd.Run()
}
