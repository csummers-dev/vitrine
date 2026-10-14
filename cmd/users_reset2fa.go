package cmd

import (
	"errors"
	"fmt"

	"github.com/spf13/cobra"

	"github.com/csummers-dev/vitrine/v4/storage"
	"github.com/csummers-dev/vitrine/v4/users"
)

func init() {
	usersCmd.AddCommand(usersResetTwoFactorCmd)
}

var usersResetTwoFactorCmd = &cobra.Command{
	Use:   "reset-2fa <id|username>",
	Short: "Turn off a user's two-factor sign-in",
	Long: `Turn off a user's two-factor sign-in, so they can sign in with their
password alone and set it up again. Use it when someone has lost their
authenticator and recovery codes, including the only admin.

Stop vitrine first: the database can only be opened by one process.`,
	Args: cobra.ExactArgs(1),
	RunE: withStore(func(_ *cobra.Command, args []string, st *store) error {
		user, err := resetTwoFactor(st.Storage, args[0])
		if err != nil {
			return err
		}
		fmt.Printf("two-factor sign-in reset for %s (id %d)\n", user.Username, user.ID)
		return nil
	}, storeOptions{}),
}

// resetTwoFactor removes the second factor of the user named by an id or
// username. It succeeds when the user had none.
func resetTwoFactor(st *storage.Storage, arg string) (*users.User, error) {
	if st.TwoFactor == nil {
		return nil, errors.New("two-factor storage isn't available")
	}
	username, id := parseUsernameOrID(arg)
	var (
		user *users.User
		err  error
	)
	if username != "" {
		user, err = st.Users.Get("", username)
	} else {
		user, err = st.Users.Get("", id)
	}
	if err != nil {
		return nil, fmt.Errorf("find user %q: %w", arg, err)
	}
	if err := st.TwoFactor.Delete(user.ID); err != nil {
		return nil, err
	}
	return user, nil
}
