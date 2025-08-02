---
description: Implement a feature
---

Start implementing this task: $ARGUMENTS

## Workflow

You must follow this workflow strictly:

- start with the `project-orchestrator` agent to review the task.
- the `project-orchestrator` agent should confirm with the user which approach it's going to implement.
- once the user confirmed, `project-orchestrator` agent proceed delegate to implement with `backend-system-architect` agent.
- when the implementation is finished, `test-automator` agent should write tests, then test again to make sure everything work properly.
- if there are any issues, use `expert-debugger` agent to debug and provide solutions, detailed plan to fix, then delegate to `backend-system-architect` agent to fix them, `backend-system-architect` agent will report back to `test-automator` agent to test again.
- if everything is good to go, report back to `project-orchestrator` agent.
- `project-orchestrator` agent review the tasks and report back to the user.
- if the user is satisfied, `project-orchestrator` agent delegate to `api-docs-specialist` agent to update the API documentation and report back to `project-orchestrator` agent to close the tasks.
- finally use `project-orchestrator` agent to commit and push all the code.
- if the user already deployed the app and there are any issues, use `devops-incident-responder` agent to investigate and debug.
