# Security

AIHome is a local developer tool with filesystem read/write capabilities. Run it only on a trusted machine and keep the server bound to localhost; it is not designed for direct internet exposure.

Only paths configured in `.aihome/config.json` are intended to be accessible through the API. Requests that resolve outside those paths, including through symbolic links, return HTTP 403. Report path-boundary bypasses privately through GitHub's security advisory flow rather than including sensitive paths or file contents in a public issue.

Do not place credentials in `AGENTS.md`, `SKILL.md`, or sample workspaces. Review configured paths before rescanning or editing files.
