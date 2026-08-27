# Demonstration script

Target length: 3 to 6 minutes.

## Before recording

1. Use a clean `DSH_HOME` and DSH `0.1.1-rc.2`.
2. Confirm `pnpm` is available to the DSH launcher.
3. Keep the repository Actions, Issues, and pull requests open in separate tabs.
4. Use the `v0.1.1` installation command from the README.

## Recording sequence

1. Show the public GitHub repository and copy the installation command.
2. Install the plugin into the clean Web profile.
3. Start `dsh web`, open Settings, and choose **Skill Manager**.
4. Search for `react`.
5. Point out a result's name, description, source, install count, and Skills.sh link.
6. Select **Install**, show the confirmation, and confirm it.
7. Show the new Managed Skill card and the `$DSH_HOME/skills/<name>/SKILL.md` file.
8. Select **Check for updates** and show the current result.
9. Select **Uninstall**, show the confirmation, and confirm it.
10. Show the empty Managed Skills state.
11. Run `npm run check` and show all tests passing.
12. Briefly show the linked Issues, pull requests, CI, AI disclosures, and `v0.1.0` Release.

Do not display API keys, GitHub tokens, private paths unrelated to the isolated
test profile, or any real user skills.
