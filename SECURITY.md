# Security policy

## Supported versions

Only the latest release of Opal gets security fixes.

## Reporting a vulnerability

Please **don't** open a public issue for security problems.

Report it privately through GitHub: go to the repository's **Security** tab and choose
**Report a vulnerability** ([direct link](https://github.com/nirwwan/opal-browser/security/advisories/new)).
Include what you found, how to reproduce it, and what an attacker could do with it.

You'll get a reply within a week. Once a fix is released, the advisory is published with credit to you,
unless you'd rather stay anonymous.

## Scope

Especially interesting:

- Ways for a web page or extension to reach Opal's privileged IPC, Opal's own `opal://` pages, or Node.js
- Leaks of saved API keys or the Onyx token outside the main process
- Agent mode doing something without the confirmation it should ask for, or touching password fields
- Problems in the sandbox launcher or the AppArmor profile shipped in the packages

Chromium vulnerabilities themselves should go to the Chromium project; Opal picks up fixes through Electron updates.
