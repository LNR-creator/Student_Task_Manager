
import { useState, useEffect } from 'react';
import './App.css';

function App() {

  // Search and filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [sortOrder, setSortOrder] = useState('default');
  const [taskLink, setTaskLink] = useState('');

  // Task states
  const [tasks, setTasks] = useState(() => {
    const savedTasks = localStorage.getItem('studentTasks');
    return savedTasks ? JSON.parse(savedTasks) : [];
  });

  const [taskInput, setTaskInput] = useState('');
  const [category, setCategory] = useState('Study');
  const [dueDate, setDueDate] = useState('');

  // Save tasks to LocalStorage
  useEffect(() => {
    localStorage.setItem(
      'studentTasks',
      JSON.stringify(tasks)
    );
  }, [tasks]);

  // Add task
  function handleAddTask() {

    if (taskInput.trim() === '') {
      alert('Please enter a task!');
      return;
    }

    const newTask = {
      id: Date.now(),
      title: taskInput.trim(),
      link: taskLink.trim(),
      category: category,
      dueDate: dueDate,
      completed: false
    };

    setTasks([...tasks, newTask]);

    setTaskInput('');
    setCategory('Study');
    setDueDate('');
    setTaskLink('');
  }

  // Complete task
  function handleComplete(id) {

    const updatedTasks = tasks.map((task) =>
      task.id === id
        ? { ...task, completed: !task.completed }
        : task
    );

    setTasks(updatedTasks);
  }

  // Delete task
  function handleDelete(id) {

    const updatedTasks = tasks.filter(
      (task) => task.id !== id
    );

    setTasks(updatedTasks);
  }

  // Export tasks to JSON
  function handleExportJSON() {

    const jsonData = JSON.stringify(tasks, null, 2);

    const blob = new Blob([jsonData], {
      type: 'application/json'
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');

    link.href = url;
    link.download = 'student-tasks-backup.json';

    link.click();

    URL.revokeObjectURL(url);
  }

  // Import tasks from JSON
  function handleImportJSON(event) {

    const file = event.target.files[0];

    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.json')) {
      alert('Please select a JSON file!');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {

      try {

        const importedTasks = JSON.parse(e.target.result);

        if (!Array.isArray(importedTasks)) {
          throw new Error('Invalid JSON structure');
        }

        const validTasks = importedTasks.every((task) =>
          task &&
          typeof task.id === 'number' &&
          typeof task.title === 'string' &&
          task.title.trim() !== '' &&
          typeof task.category === 'string' &&
          typeof task.completed === 'boolean' &&
          (task.dueDate === undefined || typeof task.dueDate === 'string') &&
          (task.link === undefined || typeof task.link === 'string')
        );

        if (!validTasks) {
          throw new Error('Invalid task data');
        }

        const confirmImport = window.confirm(
          'Importing will replace your existing tasks. Continue?'
        );

        if (confirmImport) {

          setTasks(importedTasks.map((task) => ({
            id: task.id,
            title: task.title.trim(),
            category: task.category,
            dueDate: task.dueDate || '',
            link: task.link || '',
            completed: task.completed
          })));

          alert('Tasks imported successfully!');

        }

      } catch (error) {

        alert('Invalid JSON file. Please select a valid task backup.');

      }

      event.target.value = '';

    };

    reader.onerror = () => {
      alert('Unable to read the selected file.');
      event.target.value = '';
    };

    reader.readAsText(file);
  }

  // Dashboard calculations
  const totalTasks = tasks.length;

  const completedTasks = tasks.filter(
    (task) => task.completed
  ).length;

  const pendingTasks = totalTasks - completedTasks;

  // Search and filter tasks
  let filteredTasks = tasks.filter((task) => {

    const matchesSearch = task.title
      .toLowerCase()
      .includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === 'All' ||
      (statusFilter === 'Completed' && task.completed) ||
      (statusFilter === 'Pending' && !task.completed);

    const matchesCategory =
      categoryFilter === 'All' ||
      task.category === categoryFilter;

    return matchesSearch && matchesStatus && matchesCategory;
  });

  // Sort by deadline
  if (sortOrder === 'date') {

    filteredTasks.sort((a, b) => {

      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;

      return a.dueDate.localeCompare(b.dueDate);
    });

  }

  return (

    <div className="app-container">

      {/* Header */}
      <header className="header">
        <div className="header-content">
          <div>
            <h1>Student Tasks 📚</h1>
            <p>Plan your day. Achieve your goals.</p>
          </div>

          <div className="header-icon">
            🎯
          </div>
        </div>
      </header>

      {/* Dashboard */}
      <section className="dashboard">

        <div className="card">
          <h3>Total Tasks</h3>
          <h2>{totalTasks}</h2>
        </div>

        <div className="card">
          <h3>Pending Tasks</h3>
          <h2>{pendingTasks}</h2>
        </div>

        <div className="card">
          <h3>Completed Tasks</h3>
          <h2>{completedTasks}</h2>
        </div>

      </section>

      {/* Task Section */}
      <section className="task-section">

        <h2>My Tasks</h2>

        {/* JSON Backup and Restore */}
        <div className="json-controls">

          <button
            className="export-btn"
            onClick={handleExportJSON}
            disabled={tasks.length === 0}
          >
            📥 Export JSON
          </button>

          <label className="import-btn">

            📤 Import JSON

            <input
              type="file"
              accept=".json,application/json"
              onChange={handleImportJSON}
              hidden
            />

          </label>

        </div>

        {/* Add Task */}
        <div className="add-task">

          <input
            type="text"
            placeholder="Enter your task..."
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddTask();
            }}
          />
          <input
            type="url"
            placeholder="Reference link (optional)"
            value={taskLink}
            onChange={(e) => setTaskLink(e.target.value)}
          />

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="Study">📚 Study</option>
            <option value="Assignment">📝 Assignment</option>
            <option value="Machine Learning">Machine Learning</option>
            <option value="AI">AI</option>
            <option value="Arduino">Arduino</option>
            <option value="GATE">GATE</option>
            <option value="Coding">💻 Coding</option>
            <option value="Exam">🎯 Exam</option>
            <option value="Personal">👤 Personal</option>
          </select>

          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />

          <button onClick={handleAddTask}>
            Add Task
          </button>

        </div>

        {/* Search and Filters */}
        <div className="filter-section">

          <input
            type="text"
            placeholder="🔍 Search tasks..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="All">All Tasks</option>
            <option value="Pending">Pending</option>
            <option value="Completed">Completed</option>
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="All">All Categories</option>
            <option value="Study">Study</option>
            <option value="Assignment">Assignment</option>
            <option value="Machine Learning">Machine Learning</option>
            <option value="AI">AI</option>
            <option value="Arduino">Arduino</option>
            <option value="GATE">GATE</option>
            <option value="Coding">Coding</option>
            <option value="Exam">Exam</option>
            <option value="Personal">Personal</option>
          </select>

          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          >
            <option value="default">Default Order</option>
            <option value="date">Deadline: Earliest First</option>
          </select>

        </div>

        {/* Task List */}
        <div className="task-list">

          {tasks.length === 0 ? (

            <p className="empty-message">
              No tasks available. Start by adding one!
            </p>

          ) : filteredTasks.length === 0 ? (

            <p className="empty-message">
              No matching tasks found!
            </p>

          ) : (

            filteredTasks.map((task) => (

              <div className="task-item" key={task.id}>

                <div className="task-info">

                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={() => handleComplete(task.id)}
                  />

                  <div>

                    <span className={
                      task.completed ? 'completed' : ''
                    }>
                      {task.title}
                    </span>


                    <div className="task-meta">

                      <span className="category-label">
                        {task.category}
                      </span>

                      {task.dueDate && (
                        <span className="date-label">
                          Due: {task.dueDate}
                        </span>
                      )}

                      {task.link && (
                        <a
                          href={task.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="task-link"
                        >
                          🔗 Open Reference
                        </a>
                      )}

                    </div>


                  </div>

                </div>

                <button
                  className="delete-btn"
                  onClick={() => handleDelete(task.id)}
                >
                  Delete
                </button>

              </div>

            ))

          )}

        </div>

      </section>

    </div>

  );
}

export default App;
