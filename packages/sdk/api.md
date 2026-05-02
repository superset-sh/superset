# Tasks

Types:

- <code><a href="./src/resources/tasks.ts">Task</a></code>
- <code><a href="./src/resources/tasks.ts">TaskListResponse</a></code>

Methods:

- <code title="post /api/trpc/task.create">client.tasks.<a href="./src/resources/tasks.ts">create</a>({ ...params }) -> Task</code>
- <code title="get /api/trpc/task.byIdOrSlug">client.tasks.<a href="./src/resources/tasks.ts">retrieve</a>(idOrSlug) -> Task</code>
- <code title="get /api/trpc/task.list">client.tasks.<a href="./src/resources/tasks.ts">list</a>({ ...params }) -> TaskListResponse</code>
- <code title="post /api/trpc/task.update">client.tasks.<a href="./src/resources/tasks.ts">update</a>({ ...params }) -> Task</code>
- <code title="post /api/trpc/task.delete">client.tasks.<a href="./src/resources/tasks.ts">delete</a>(id) -> void</code>
