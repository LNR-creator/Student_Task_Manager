
import { useState, useEffect } from 'react';
import { LocalNotifications } from '@capacitor/local-notifications';
import './App.css';

function getReferenceUrl(value) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return '';

  try {
    const url = new URL(trimmedValue);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function getReminderId(taskId, reminderType) {
  const value = `${taskId}-${reminderType}`;
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  }
  return Math.abs(hash % 2147483647) || 1;
}

function getTaskReminders(tasks) {
  const now = Date.now();
  return tasks.flatMap((task) => {
    if (task.completed) return [];

    return [
      task.startDate && {
        id: getReminderId(task.id, 'start'),
        title: 'Task starts today',
        body: task.title,
        schedule: { at: new Date(`${task.startDate}T09:00:00`) }
      },
      task.dueDate && {
        id: getReminderId(task.id, 'deadline'),
        title: 'Task deadline today',
        body: task.title,
        schedule: { at: new Date(`${task.dueDate}T09:00:00`) }
      }
    ].filter((reminder) => (
      reminder && !Number.isNaN(reminder.schedule.at.getTime()) &&
      reminder.schedule.at.getTime() > now
    ));
  });
}

const DEFAULT_CATEGORIES = [
  'Study',
  'Assignment',
  'Machine Learning',
  'AI',
  'Arduino',
  'GATE',
  'Coding',
  'Exam',
  'Personal'
];

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
  const [categories, setCategories] = useState(() => {
    const savedCategories = localStorage.getItem('studentTaskCategories');
    let storedCategories = [];

    if (savedCategories) {
      try {
        const parsedCategories = JSON.parse(savedCategories);
        if (Array.isArray(parsedCategories)) {
          storedCategories = parsedCategories.filter(
            (item) => typeof item === 'string' && item.trim()
          );
        }
      } catch {
        storedCategories = [];
      }
    }

    const savedTasks = JSON.parse(localStorage.getItem('studentTasks') || '[]');
    const taskCategories = Array.isArray(savedTasks)
      ? savedTasks.map((task) => task?.category).filter(
        (item) => typeof item === 'string' && item.trim()
      )
      : [];

    return [...new Set([...DEFAULT_CATEGORIES, ...storedCategories, ...taskCategories])];
  });
  const [categoryInput, setCategoryInput] = useState('');
  const [category, setCategory] = useState('Study');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [selectedSubtaskIndex, setSelectedSubtaskIndex] = useState(null);
  const [subtaskInput, setSubtaskInput] = useState('');
  const [subtaskReferenceInput, setSubtaskReferenceInput] = useState('');
  const [taskReferenceDraft, setTaskReferenceDraft] = useState('');
  const [subtaskReferenceDraft, setSubtaskReferenceDraft] = useState('');
  const [taskDateDraft, setTaskDateDraft] = useState({ startDate: '', dueDate: '' });
  const [notificationStatus, setNotificationStatus] = useState('');
  const [reminderSyncVersion, setReminderSyncVersion] = useState(0);

  // Save tasks to LocalStorage
  useEffect(() => {
    localStorage.setItem(
      'studentTasks',
      JSON.stringify(tasks)
    );
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem('studentTaskCategories', JSON.stringify(categories));
  }, [categories]);

  const reminderTaskData = JSON.stringify(tasks.map((task) => ({
    id: task.id,
    title: task.title,
    startDate: task.startDate || '',
    dueDate: task.dueDate || '',
    completed: task.completed
  })));

  useEffect(() => {
    async function synchronizeReminders() {
      try {
        const scheduledIds = JSON.parse(
          localStorage.getItem('studentTaskReminderIds') || '[]'
        );
        if (!Array.isArray(scheduledIds)) {
          throw new Error('Saved reminder IDs are invalid.');
        }

        const notifications = getTaskReminders(JSON.parse(reminderTaskData));
        if (scheduledIds.length > 0) {
          await LocalNotifications.cancel({
            notifications: scheduledIds.map((id) => ({ id }))
          });
        }

        if (notifications.length === 0) {
          localStorage.removeItem('studentTaskReminderIds');
          setNotificationStatus('');
          return;
        }

        const permission = await LocalNotifications.checkPermissions();
        if (permission.display !== 'granted') {
          localStorage.removeItem('studentTaskReminderIds');
          setNotificationStatus('Enable notifications to receive your task reminders.');
          return;
        }

        await LocalNotifications.schedule({ notifications });
        localStorage.setItem(
          'studentTaskReminderIds',
          JSON.stringify(notifications.map(({ id }) => id))
        );
        setNotificationStatus(
          'Reminders are scheduled for 9:00 AM on upcoming start dates and deadlines.'
        );
      } catch (error) {
        console.error('Unable to synchronize task reminders:', error);
        setNotificationStatus(
          `Unable to schedule task reminders: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    synchronizeReminders();
  }, [reminderTaskData, reminderSyncVersion]);

  async function requestNotificationPermission() {
    try {
      const currentPermission = await LocalNotifications.checkPermissions();
      if (currentPermission.display === 'granted') {
        setReminderSyncVersion((version) => version + 1);
        return true;
      }

      const permission = await LocalNotifications.requestPermissions();
      if (permission.display === 'granted') {
        setReminderSyncVersion((version) => version + 1);
        return true;
      }

      setNotificationStatus('Notifications are disabled. The task was saved without reminders.');
      return false;
    } catch (error) {
      console.error('Unable to request notification permission:', error);
      setNotificationStatus(
        `Notifications are unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return false;
    }
  }

  function handleAddCategory(event) {
    event.preventDefault();
    const newCategory = categoryInput.trim();

    if (!newCategory) return;

    if (categories.some((item) => item.toLowerCase() === newCategory.toLowerCase())) {
      alert('That category already exists.');
      return;
    }

    setCategories((currentCategories) => [...currentCategories, newCategory]);
    setCategory(newCategory);
    setCategoryInput('');
  }

  function handleDeleteCategory(categoryToDelete) {
    if (categories.length <= 1) {
      alert('At least one category must remain.');
      return;
    }

    if (!window.confirm(`Do you really want to delete ${categoryToDelete}`)) {
      return;
    }

    const remainingCategories = categories.filter(
      (item) => item !== categoryToDelete
    );
    const fallbackCategory = remainingCategories[0];

    setCategories(remainingCategories);
    setTasks((currentTasks) => currentTasks.map((task) => (
      task.category === categoryToDelete
        ? { ...task, category: fallbackCategory }
        : task
    )));

    if (category === categoryToDelete) setCategory(fallbackCategory);
    if (categoryFilter === categoryToDelete) setCategoryFilter('All');
  }

  // Add task
  async function handleAddTask() {

    if (taskInput.trim() === '') {
      alert('Please enter a task!');
      return;
    }

    if (!category) {
      alert('Please add a category before creating a task.');
      return;
    }

    const link = getReferenceUrl(taskLink);
    if (link === null) {
      alert('Enter a valid http or https reference link.');
      return;
    }

    if (startDate && dueDate && dueDate < startDate) {
      alert('The deadline cannot be before the start date.');
      return;
    }

    if (getTaskReminders([{ id: Date.now(), title: taskInput.trim(), startDate, dueDate }]).length > 0) {
      await requestNotificationPermission();
    }

    const newTask = {
      id: Date.now(),
      title: taskInput.trim(),
      link,
      category: category,
      startDate,
      dueDate: dueDate,
      completed: false,
      notes: '',
      subtasks: []
    };

    setTasks((currentTasks) => [...currentTasks, newTask]);

    setTaskInput('');
    setCategory('Study');
    setStartDate('');
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
    const taskToDelete = tasks.find((task) => task.id === id);
    if (!taskToDelete) return;

    if (!window.confirm(`Do you really want to delete the task: ${taskToDelete.title}?`)) {
      return;
    }

    const updatedTasks = tasks.filter(
      (task) => task.id !== id
    );

    setTasks(updatedTasks);
    if (selectedTaskId === id) {
      setSelectedTaskId(null);
      setSelectedSubtaskIndex(null);
    }
  }

  function updateTask(id, update) {
    setTasks((currentTasks) => currentTasks.map((task) => (
      task.id === id ? { ...task, ...update } : task
    )));
  }

  async function handleSaveTaskDates(event) {
    event.preventDefault();
    if (!selectedTask) return;

    const { startDate: nextStartDate, dueDate: nextDueDate } = taskDateDraft;
    if (nextStartDate && nextDueDate && nextDueDate < nextStartDate) {
      alert('The deadline cannot be before the start date.');
      return;
    }

    if (getTaskReminders([{
      ...selectedTask,
      startDate: nextStartDate,
      dueDate: nextDueDate
    }]).length > 0) {
      await requestNotificationPermission();
    }

    updateTask(selectedTask.id, {
      startDate: nextStartDate,
      dueDate: nextDueDate
    });
  }

  function handleSaveTaskReference(event) {
    event.preventDefault();
    if (!selectedTask) return;

    const link = getReferenceUrl(taskReferenceDraft);
    if (link === null) {
      alert('Enter a valid http or https reference link.');
      return;
    }

    updateTask(selectedTask.id, { link });
    setTaskReferenceDraft(link);
  }

  function handleAddSubtask(event) {
    event.preventDefault();
    const title = subtaskInput.trim();
    if (!title || !selectedTask) return;

    const link = getReferenceUrl(subtaskReferenceInput);
    if (link === null) {
      alert('Enter a valid http or https reference link.');
      return;
    }

    updateTask(selectedTask.id, {
      subtasks: [
        ...(selectedTask.subtasks || []),
        { title, link, completed: false }
      ]
    });
    setSubtaskInput('');
    setSubtaskReferenceInput('');
  }

  function handleToggleSubtask(subtaskIndex) {
    if (!selectedTask) return;
    updateTask(selectedTask.id, {
      subtasks: (selectedTask.subtasks || []).map((subtask, index) => (
        index === subtaskIndex
          ? { ...subtask, completed: !subtask.completed }
          : subtask
      ))
    });
  }

  function handleDeleteSubtask(subtaskIndex) {
    if (!selectedTask) return;
    const subtaskToDelete = selectedTask.subtasks?.[subtaskIndex];
    if (!subtaskToDelete) return;

    if (!window.confirm(
      `Do you really want to delete subtask ${subtaskToDelete.title}\n\nMain Task : ${selectedTask.title}`
    )) {
      return;
    }

    updateTask(selectedTask.id, {
      subtasks: (selectedTask.subtasks || []).filter(
        (_, index) => index !== subtaskIndex
      )
    });
    if (selectedSubtaskIndex === subtaskIndex) setSelectedSubtaskIndex(null);
    else if (selectedSubtaskIndex > subtaskIndex) {
      setSelectedSubtaskIndex(selectedSubtaskIndex - 1);
    }
  }

  function handleUpdateSubtaskNote(subtaskIndex, notes) {
    if (!selectedTask) return;
    updateTask(selectedTask.id, {
      subtasks: (selectedTask.subtasks || []).map((subtask, index) => (
        index === subtaskIndex ? { ...subtask, notes } : subtask
      ))
    });
  }

  function handleSaveSubtaskReference(event) {
    event.preventDefault();
    if (!selectedTask || selectedSubtaskIndex === null) return;

    const link = getReferenceUrl(subtaskReferenceDraft);
    if (link === null) {
      alert('Enter a valid http or https reference link.');
      return;
    }

    updateTask(selectedTask.id, {
      subtasks: (selectedTask.subtasks || []).map((subtask, index) => (
        index === selectedSubtaskIndex ? { ...subtask, link } : subtask
      ))
    });
    setSubtaskReferenceDraft(link);
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
          (task.startDate === undefined || typeof task.startDate === 'string') &&
          (task.dueDate === undefined || typeof task.dueDate === 'string') &&
          (task.link === undefined || typeof task.link === 'string') &&
          (task.subtasks === undefined || Array.isArray(task.subtasks))
        );

        if (!validTasks) {
          throw new Error('Invalid task data');
        }

        const confirmImport = window.confirm(
          'Importing will replace your existing tasks. Continue?'
        );

        if (confirmImport) {

          setCategories((currentCategories) => [
            ...new Set([
              ...currentCategories,
              ...importedTasks.map((task) => task.category.trim()).filter(Boolean)
            ])
          ]);

          setTasks(importedTasks.map((task) => ({
            id: task.id,
            title: task.title.trim(),
            category: task.category,
            startDate: task.startDate || '',
            dueDate: task.dueDate || '',
            link: getReferenceUrl(task.link || '') || '',
            completed: task.completed,
            notes: typeof task.notes === 'string' ? task.notes : '',
            subtasks: Array.isArray(task.subtasks)
              ? task.subtasks.filter((subtask) =>
                subtask &&
                typeof subtask.title === 'string' &&
                typeof subtask.completed === 'boolean'
              ).map((subtask) => ({
                title: subtask.title,
                completed: subtask.completed,
                notes: typeof subtask.notes === 'string' ? subtask.notes : '',
                link: typeof subtask.link === 'string'
                  ? getReferenceUrl(subtask.link) || ''
                  : ''
              }))
              : []
          })));

          alert('Tasks imported successfully!');

        }

      } catch {

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
  const selectedTask = tasks.find((task) => task.id === selectedTaskId);

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

  if (selectedTask) {
    const subtasks = Array.isArray(selectedTask.subtasks) ? selectedTask.subtasks : [];
    const selectedSubtask = selectedSubtaskIndex === null
      ? null
      : subtasks[selectedSubtaskIndex];

    return (
      <main className="app-container">
        <section className="task-section task-detail">
          {selectedSubtask ? (
            <>
              <button
                type="button"
                className="back-btn"
                onClick={() => setSelectedSubtaskIndex(null)}
              >
                ← Back to {selectedTask.title}
              </button>

              <header className="task-detail-header">
                <div>
                  <p className="task-detail-eyebrow">Subtask notes</p>
                  <h1>{selectedSubtask.title}</h1>
                  <p className="subtask-parent-label">Main Task: {selectedTask.title}</p>
                </div>
                <span className={selectedSubtask.completed ? 'detail-status completed' : 'detail-status'}>
                  {selectedSubtask.completed ? 'Completed' : 'In progress'}
                </span>
              </header>

              <form className="reference-form" onSubmit={handleSaveSubtaskReference}>
                <label className="detail-label" htmlFor="subtask-reference">Reference link</label>
                <div>
                  <input
                    id="subtask-reference"
                    type="url"
                    placeholder="https://example.com"
                    value={subtaskReferenceDraft}
                    onChange={(event) => setSubtaskReferenceDraft(event.target.value)}
                  />
                  <button type="submit" className="category-add-btn">Save link</button>
                </div>
              </form>
              {getReferenceUrl(selectedSubtask.link || '') && (
                <a
                  href={getReferenceUrl(selectedSubtask.link)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="task-link detail-reference-link"
                >
                  🔗 Open subtask reference
                </a>
              )}

              <label className="detail-label" htmlFor="subtask-notes">Notes</label>
              <textarea
                id="subtask-notes"
                className="task-notes"
                placeholder="Write your notes about this subtask..."
                value={selectedSubtask.notes || ''}
                onChange={(event) => handleUpdateSubtaskNote(selectedSubtaskIndex, event.target.value)}
              />
            </>
          ) : (
            <>
          <button
            type="button"
            className="back-btn"
            onClick={() => {
              setSelectedTaskId(null);
              setSelectedSubtaskIndex(null);
              setSubtaskInput('');
            }}
          >
            ← Back to tasks
          </button>

          <header className="task-detail-header">
            <div>
              <p className="task-detail-eyebrow">Task notes</p>
              <h1>{selectedTask.title}</h1>
              <div className="task-meta">
                <span className="category-label">{selectedTask.category}</span>
                {selectedTask.startDate && (
                  <span className="date-label">Starts: {selectedTask.startDate}</span>
                )}
                {selectedTask.dueDate && (
                  <span className="date-label">Deadline: {selectedTask.dueDate}</span>
                )}
              </div>
            </div>
            <span className={selectedTask.completed ? 'detail-status completed' : 'detail-status'}>
              {selectedTask.completed ? 'Completed' : 'In progress'}
            </span>
          </header>

          {notificationStatus && (
            <p className="notification-status" role="status">{notificationStatus}</p>
          )}

          <form className="task-date-form" onSubmit={handleSaveTaskDates}>
            <label>
              Start date
              <input
                type="date"
                value={taskDateDraft.startDate}
                onChange={(event) => setTaskDateDraft((dates) => ({
                  ...dates,
                  startDate: event.target.value
                }))}
              />
            </label>
            <label>
              Deadline
              <input
                type="date"
                min={taskDateDraft.startDate || undefined}
                value={taskDateDraft.dueDate}
                onChange={(event) => setTaskDateDraft((dates) => ({
                  ...dates,
                  dueDate: event.target.value
                }))}
              />
            </label>
            <button type="submit" className="category-add-btn">Save dates &amp; reminders</button>
          </form>

          <form className="reference-form" onSubmit={handleSaveTaskReference}>
            <label className="detail-label" htmlFor="task-reference">Reference link</label>
            <div>
              <input
                id="task-reference"
                type="url"
                placeholder="https://example.com"
                value={taskReferenceDraft}
                onChange={(event) => setTaskReferenceDraft(event.target.value)}
              />
              <button type="submit" className="category-add-btn">Save link</button>
            </div>
          </form>
          {getReferenceUrl(selectedTask.link || '') && (
            <a
              href={getReferenceUrl(selectedTask.link)}
              target="_blank"
              rel="noopener noreferrer"
              className="task-link detail-reference-link"
            >
              🔗 Open task reference
            </a>
          )}

          <label className="detail-label" htmlFor="task-notes">Notes</label>
          <textarea
            id="task-notes"
            className="task-notes"
            placeholder="Write your notes about this task..."
            value={selectedTask.notes || ''}
            onChange={(event) => updateTask(selectedTask.id, { notes: event.target.value })}
          />

          <section className="subtasks-section" aria-labelledby="subtasks-title">
            <div className="subtasks-heading">
              <div>
                <h2 id="subtasks-title">Subtasks</h2>
                <p>Break this task into smaller steps.</p>
              </div>
              <span className="subtask-count">{subtasks.filter((item) => item.completed).length}/{subtasks.length}</span>
            </div>

            <form className="subtask-form" onSubmit={handleAddSubtask}>
              <input
                type="text"
                aria-label="New subtask"
                placeholder="Add a subtask..."
                value={subtaskInput}
                onChange={(event) => setSubtaskInput(event.target.value)}
              />
              <input
                type="url"
                aria-label="Subtask reference link"
                placeholder="Reference link (optional)"
                value={subtaskReferenceInput}
                onChange={(event) => setSubtaskReferenceInput(event.target.value)}
              />
              <button type="submit" className="category-add-btn">Add subtask</button>
            </form>

            {subtasks.length > 0 ? (
              <ul className="subtask-list">
                {subtasks.map((subtask, index) => (
                  <li className="subtask-item" key={`${index}-${subtask.title}`}>
                    <label>
                      <input
                        type="checkbox"
                        checked={subtask.completed}
                        onChange={() => handleToggleSubtask(index)}
                      />
                    </label>
                    <button
                      type="button"
                      className={`subtask-title-btn${subtask.completed ? ' subtask-completed' : ''}`}
                      onClick={() => {
                        setSelectedSubtaskIndex(index);
                        setSubtaskReferenceDraft(subtask.link || '');
                      }}
                    >
                      <span>
                        {subtask.title}
                      </span>
                      <span className="subtask-note-indicator">
                        {subtask.notes ? 'View / edit note' : 'Add note'}
                      </span>
                      {getReferenceUrl(subtask.link || '') && (
                        <span className="subtask-note-indicator">Reference link added</span>
                      )}
                    </button>
                    {getReferenceUrl(subtask.link || '') && (
                      <a
                        href={getReferenceUrl(subtask.link)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="task-link"
                        onClick={(event) => event.stopPropagation()}
                      >
                        Open link
                      </a>
                    )}
                    <button
                      type="button"
                      className="subtask-delete-btn"
                      onClick={() => handleDeleteSubtask(index)}
                      aria-label={`Delete subtask ${subtask.title}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="subtasks-empty">No subtasks yet.</p>
            )}
          </section>
            </>
          )}
        </section>
      </main>
    );
  }

  return (

    <div className="app-container">

      {/* Header */}
      <header className="header">
        <div className="header-content">
          <div>
            <h1>Student Tasks 📚</h1>
            <p>Plan your day. Achieve your goals.</p>
            {notificationStatus && (
              <p className="notification-status" role="status">{notificationStatus}</p>
            )}
          </div>

          <div className="header-icon">
            🎯
          </div>
        </div>
      </header>

      {/* Dashboard */}
      <section className="dashboard">
        <button
          type="button"
          className="notification-button"
          onClick={requestNotificationPermission}
        >
          🔔 Enable notifications
        </button>

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
            aria-label="Task reference link"
            value={taskLink}
            onChange={(e) => setTaskLink(e.target.value)}
          />

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.map((item) => (
              <option value={item} key={item}>{item}</option>
            ))}
          </select>

          <label className="date-input-label">
            Start date
            <input
              type="date"
              aria-label="Task start date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>

          <label className="date-input-label">
            Deadline
            <input
            type="date"
            aria-label="Task deadline"
            min={startDate || undefined}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          </label>

          <button onClick={handleAddTask}>
            Add Task
          </button>

        </div>
        <p className="reminder-help">
          Reminders are sent at 9:00 AM local time on upcoming start dates and deadlines.
          On the web, keep this page open to receive them.
        </p>

        <section className="category-manager" aria-labelledby="category-manager-title">
          <div className="category-manager-heading">
            <div>
              <h3 id="category-manager-title">Manage categories</h3>
              <p>Add your own categories or remove ones you no longer need.</p>
            </div>
          </div>

          <form className="category-form" onSubmit={handleAddCategory}>
            <input
              type="text"
              placeholder="New category name"
              aria-label="New category name"
              maxLength={40}
              value={categoryInput}
              onChange={(event) => setCategoryInput(event.target.value)}
            />
            <button type="submit" className="category-add-btn">Add category</button>
          </form>

          <ul className="category-list" aria-label="Categories">
            {categories.map((item) => (
              <li className="category-chip" key={item}>
                <span>{item}</span>
                <button
                  type="button"
                  className="category-remove-btn"
                  onClick={() => handleDeleteCategory(item)}
                  disabled={categories.length <= 1}
                  aria-label={`Delete ${item} category`}
                  title={categories.length <= 1 ? 'At least one category must remain' : `Delete ${item}`}
                >
                  <span aria-hidden="true">&times;</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

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
            {categories.map((item) => (
              <option value={item} key={item}>{item}</option>
            ))}
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

                    <button
                      type="button"
                      className={`task-title-btn${task.completed ? ' completed' : ''}`}
                      onClick={() => {
                        setSelectedTaskId(task.id);
                        setSelectedSubtaskIndex(null);
                        setTaskReferenceDraft(task.link || '');
                        setTaskDateDraft({
                          startDate: task.startDate || '',
                          dueDate: task.dueDate || ''
                        });
                      }}
                    >
                      {task.title}
                    </button>


                    <div className="task-meta">

                      <span className="category-label">
                        {task.category}
                      </span>

                      {task.startDate && (
                        <span className="date-label">
                          Starts: {task.startDate}
                        </span>
                      )}

                      {task.dueDate && (
                        <span className="date-label">
                          Deadline: {task.dueDate}
                        </span>
                      )}

                      {getReferenceUrl(task.link || '') && (
                        <a
                          href={getReferenceUrl(task.link)}
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
