const express = require('express');
const app = express();

app.use(express.json());

// Temporary data (no database)
let tasks = [];
let id = 1;

// CREATE Task
app.post('/tasks', (req, res) => {
    const { title, description, status } = req.body;

    const newTask = {
        id: id++,
        title,
        description,
        status: status || "pending"
    };

    tasks.push(newTask);
    res.status(201).json(newTask);
});

// READ all tasks
app.get('/tasks', (req, res) => {
    res.json(tasks);
});

// READ single task
app.get('/tasks/:id', (req, res) => {
    const task = tasks.find(t => t.id == req.params.id);

    if (!task) {
        return res.status(404).json({ message: "Task not found" });
    }

    res.json(task);
});

// UPDATE task
app.put('/tasks/:id', (req, res) => {
    const task = tasks.find(t => t.id == req.params.id);

    if (!task) {
        return res.status(404).json({ message: "Task not found" });
    }

    const { title, description, status } = req.body;

    if (title) task.title = title;
    if (description) task.description = description;
    if (status) task.status = status;

    res.json(task);
});

// DELETE task
app.delete('/tasks/:id', (req, res) => {
    tasks = tasks.filter(t => t.id != req.params.id);
    res.json({ message: "Task deleted successfully" });
});

// Server
app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});
