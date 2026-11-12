
import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import {
  setupNotificationChannel,
  scheduleTestNotification,
  requestPermissions,
  checkPermissions,
  cancelTaskNotifications,
  syncAllTaskNotifications,
  isTaskOverdue,
  getNotificationSettings,
  saveNotificationSettings
} from './services/notificationService';
import { LinkBadge } from './components/LinkBadge';
import './App.css';

const DEFAULT_REMINDER_TIME = '09:00';

function isValidTime(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function getTaskDateTime(date, time) {
  if (!date) return null;
  const dateTime = new Date(`${date}T${isValidTime(time) ? time : DEFAULT_REMINDER_TIME}:00`);
  return Number.isNaN(dateTime.getTime()) ? null : dateTime;
}

function getReferenceUrl(value) {
  const trimmedValue = typeof value === 'string' ? value.trim() : '';
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

function normalizeLinks(links, fallbackLink) {
  let list = [];
  if (Array.isArray(links)) {
    list = links;
  } else if (typeof links === 'string' && links.trim()) {
    list = [links.trim()];
  } else if (typeof fallbackLink === 'string' && fallbackLink.trim()) {
    list = [fallbackLink.trim()];
  }

  const valid = [];
  for (const item of list) {
    const parsed = getReferenceUrl(item);
    if (parsed && !valid.includes(parsed)) {
      valid.push(parsed);
    }
  }
  return valid;
}

function normalizeSubtasks(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item, index) => {
    if (!item || typeof item !== 'object') {
      return {
        id: `st-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
        title: String(item || ''),
        link: '',
        links: [],
        notes: '',
        completed: false,
        subtasks: []
      };
    }
    const links = normalizeLinks(item.links, item.link);
    return {
      id: item.id || `st-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
      title: typeof item.title === 'string' ? item.title : '',
      link: links[0] || (typeof item.link === 'string' ? item.link : ''),
      links,
      notes: typeof item.notes === 'string' ? item.notes : '',
      completed: Boolean(item.completed),
      subtasks: normalizeSubtasks(item.subtasks)
    };
  });
}

function normalizeTask(task) {
  if (!task || typeof task !== 'object') return task;
  const links = normalizeLinks(task.links, task.link);
  return {
    ...task,
    link: links[0] || (typeof task.link === 'string' ? task.link : ''),
    links,
    subtasks: normalizeSubtasks(task.subtasks)
  };
}

function findSubtask(subtasks, id) {
  if (!Array.isArray(subtasks)) return null;
  for (const st of subtasks) {
    if (st.id === id) return st;
    if (st.subtasks && st.subtasks.length > 0) {
      const found = findSubtask(st.subtasks, id);
      if (found) return found;
    }
  }
  return null;
}

function updateSubtaskInTree(list, targetId, updateFn) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => {
    if (item.id === targetId) {
      return updateFn(item);
    }
    if (item.subtasks && item.subtasks.length > 0) {
      return {
        ...item,
        subtasks: updateSubtaskInTree(item.subtasks, targetId, updateFn)
      };
    }
    return item;
  });
}

function deleteSubtaskFromTree(list, targetId) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item.id !== targetId)
    .map((item) => ({
      ...item,
      subtasks: item.subtasks ? deleteSubtaskFromTree(item.subtasks, targetId) : []
    }));
}

function addSubtaskToTree(list, parentId, newSubtask) {
  if (!Array.isArray(list)) return [];
  return list.map((item) => {
    if (item.id === parentId) {
      return {
        ...item,
        subtasks: [...(item.subtasks || []), newSubtask]
      };
    }
    if (item.subtasks && item.subtasks.length > 0) {
      return {
        ...item,
        subtasks: addSubtaskToTree(item.subtasks, parentId, newSubtask)
      };
    }
    return item;
  });
}

function countSubtasksRecursive(list) {
  let total = 0;
  let completed = 0;
  function walk(items) {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      total++;
      if (item.completed) completed++;
      if (item.subtasks && item.subtasks.length > 0) {
        walk(item.subtasks);
      }
    }
  }
  walk(list);
  return { total, completed };
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
  const [taskLinks, setTaskLinks] = useState([]);

  // Task states
  const [tasks, setTasks] = useState(() => {
    const savedTasks = localStorage.getItem('studentTasks');
    if (!savedTasks) return [];
    try {
      const parsed = JSON.parse(savedTasks);
      if (Array.isArray(parsed)) {
        return parsed.map(normalizeTask);
      }
      return [];
    } catch {
      return [];
    }
  });

  const [taskInput, setTaskInput] = useState('');
  const [taskNotesInput, setTaskNotesInput] = useState('');
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
  const [startTime, setStartTime] = useState(DEFAULT_REMINDER_TIME);
  const [dueDate, setDueDate] = useState('');
  const [endTime, setEndTime] = useState(DEFAULT_REMINDER_TIME);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [subtaskPath, setSubtaskPath] = useState([]);
  const [subtaskInput, setSubtaskInput] = useState('');
  const [subtaskReferenceInput, setSubtaskReferenceInput] = useState('');
  const [taskReferenceDraft, setTaskReferenceDraft] = useState('');
  const [subtaskReferenceDraft, setSubtaskReferenceDraft] = useState('');
  const [taskDateDraft, setTaskDateDraft] = useState({
    startDate: '',
    startTime: DEFAULT_REMINDER_TIME,
    dueDate: '',
    endTime: DEFAULT_REMINDER_TIME
  });
  const [notificationStatus, setNotificationStatus] = useState('');
  const [reminderSyncVersion, setReminderSyncVersion] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('studentTaskTheme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
    localStorage.setItem('studentTaskTheme', theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }

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

  useEffect(() => {
    setupNotificationChannel();
  }, []);

  const [notificationSettings, setNotificationSettings] = useState(getNotificationSettings);

  useEffect(() => {
    saveNotificationSettings(notificationSettings);
  }, [notificationSettings]);

  useEffect(() => {
    let cancelled = false;

    async function syncReminders() {
      try {
        if (!notificationSettings.enabled) {
          if (Capacitor.isNativePlatform()) {
            const scheduledIds = JSON.parse(
              localStorage.getItem('studentTaskReminderIds') || '[]'
            );
            if (Array.isArray(scheduledIds) && scheduledIds.length > 0) {
              await LocalNotifications.cancel({
                notifications: scheduledIds.map((id) => ({ id }))
              });
            }
            localStorage.removeItem('studentTaskReminderIds');
          }
          if (!cancelled) setNotificationStatus('Notifications are currently turned off in settings.');
          return;
        }

        const scheduled = await syncAllTaskNotifications(tasks, notificationSettings);
        if (cancelled) return;

        if (scheduled.length > 0) {
          setNotificationStatus(`🔔 Active deadline reminders: ${scheduled.length} scheduled across your tasks.`);
        } else {
          setNotificationStatus('');
        }
      } catch (err) {
        console.error('Failed to sync reminders:', err);
      }
    }

    syncReminders();
    return () => {
      cancelled = true;
    };
  }, [tasks, notificationSettings, reminderSyncVersion]);

  async function requestNotificationPermission() {
    try {
      const granted = await requestPermissions();
      if (granted) {
        setReminderSyncVersion((version) => version + 1);
        setNotificationStatus('✅ Notifications enabled! Reminders will trigger automatically.');
        return true;
      }
      setNotificationStatus('⚠️ Notifications are disabled. You can enable them in device settings.');
      return false;
    } catch (error) {
      console.error('Unable to request notification permission:', error);
      setNotificationStatus(
        `Notifications error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return false;
    }
  }

  async function handleTestNotification() {
    try {
      setNotificationStatus('Scheduling 10-second test notification...');
      const triggerTime = await scheduleTestNotification(10);
      const timeStr = triggerTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setNotificationStatus(`⏳ Test alert scheduled for ${timeStr}! You can minimize or close the app now to test.`);
    } catch (error) {
      setNotificationStatus(`❌ ${error instanceof Error ? error.message : 'Failed to schedule test notification.'}`);
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

  function handleAddCreationLink() {
    if (!taskLink.trim()) return;
    const validated = getReferenceUrl(taskLink);
    if (!validated) {
      alert('Please enter a valid http or https URL.');
      return;
    }
    if (taskLinks.includes(validated)) {
      alert('This link has already been added.');
      return;
    }
    setTaskLinks((prev) => [...prev, validated]);
    setTaskLink('');
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

    const linksToAdd = [...taskLinks];
    if (taskLink.trim()) {
      const link = getReferenceUrl(taskLink);
      if (link === null) {
        alert('Enter a valid http or https reference link.');
        return;
      }
      if (link && !linksToAdd.includes(link)) {
        linksToAdd.push(link);
      }
    }

    const startDateTime = getTaskDateTime(startDate, startTime);
    const dueDateTime = getTaskDateTime(dueDate, endTime);
    if (startDateTime && dueDateTime && dueDateTime < startDateTime) {
      alert('The deadline cannot be before the start date.');
      return;
    }

    if (dueDate) {
      await requestNotificationPermission();
    }

    const newTask = {
      id: Date.now(),
      title: taskInput.trim(),
      link: linksToAdd[0] || '',
      links: linksToAdd,
      category: category,
      startDate,
      startTime,
      dueDate: dueDate,
      endTime,
      dueTime: endTime,
      completed: false,
      notes: taskNotesInput.trim(),
      subtasks: []
    };

    setTasks((currentTasks) => [...currentTasks, newTask]);

    setTaskInput('');
    setTaskNotesInput('');
    setCategory('Study');
    setStartDate('');
    setStartTime(DEFAULT_REMINDER_TIME);
    setDueDate('');
    setEndTime(DEFAULT_REMINDER_TIME);
    setTaskLink('');
    setTaskLinks([]);
  }

  // Complete task
  async function handleComplete(id) {
    const updatedTasks = tasks.map((task) =>
      task.id === id
        ? { ...task, completed: !task.completed }
        : task
    );

    const target = updatedTasks.find((t) => t.id === id);
    if (target?.completed) {
      await cancelTaskNotifications(id);
    }

    setTasks(updatedTasks);
  }

  // Delete task
  async function handleDelete(id) {
    const taskToDelete = tasks.find((task) => task.id === id);
    if (!taskToDelete) return;

    if (!window.confirm(`Do you really want to delete the task: ${taskToDelete.title}?`)) {
      return;
    }

    await cancelTaskNotifications(id);

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

    const {
      startDate: nextStartDate,
      startTime: nextStartTime,
      dueDate: nextDueDate,
      endTime: nextEndTime
    } = taskDateDraft;
    const nextStartDateTime = getTaskDateTime(nextStartDate, nextStartTime);
    const nextDueDateTime = getTaskDateTime(nextDueDate, nextEndTime);
    if (nextStartDateTime && nextDueDateTime && nextDueDateTime < nextStartDateTime) {
      alert('The deadline cannot be before the start date.');
      return;
    }

    if (nextDueDate) {
      await requestNotificationPermission();
    }

    await cancelTaskNotifications(selectedTask.id);

    updateTask(selectedTask.id, {
      startDate: nextStartDate,
      startTime: nextStartTime,
      dueDate: nextDueDate,
      endTime: nextEndTime,
      dueTime: nextEndTime
    });
  }

  function handleAddTaskLink(event) {
    if (event) event.preventDefault();
    if (!selectedTask) return;

    const url = getReferenceUrl(taskReferenceDraft);
    if (!url) {
      alert('Enter a valid http or https reference link.');
      return;
    }

    const currentLinks = selectedTask.links && selectedTask.links.length > 0
      ? selectedTask.links
      : (selectedTask.link ? [selectedTask.link] : []);

    if (currentLinks.includes(url)) {
      alert('This reference link has already been added.');
      return;
    }

    const nextLinks = [...currentLinks, url];
    updateTask(selectedTask.id, {
      links: nextLinks,
      link: nextLinks[0] || ''
    });
    setTaskReferenceDraft('');
  }

  function handleDeleteTaskLink(urlToDelete) {
    if (!selectedTask) return;

    const currentLinks = selectedTask.links && selectedTask.links.length > 0
      ? selectedTask.links
      : (selectedTask.link ? [selectedTask.link] : []);

    const nextLinks = currentLinks.filter((item) => item !== urlToDelete);
    updateTask(selectedTask.id, {
      links: nextLinks,
      link: nextLinks[0] || ''
    });
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

    const links = link ? [link] : [];
    const newSubtask = {
      id: `st-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title,
      link: link || '',
      links,
      notes: '',
      completed: false,
      subtasks: []
    };

    if (subtaskPath.length === 0) {
      updateTask(selectedTask.id, {
        subtasks: [...(selectedTask.subtasks || []), newSubtask]
      });
    } else {
      const parentId = subtaskPath[subtaskPath.length - 1];
      const updatedSubtasks = addSubtaskToTree(selectedTask.subtasks || [], parentId, newSubtask);
      updateTask(selectedTask.id, { subtasks: updatedSubtasks });
    }

    setSubtaskInput('');
    setSubtaskReferenceInput('');
  }

  function handleToggleSubtask(subtaskId) {
    if (!selectedTask) return;
    const updatedSubtasks = updateSubtaskInTree(selectedTask.subtasks || [], subtaskId, (st) => ({
      ...st,
      completed: !st.completed
    }));
    updateTask(selectedTask.id, { subtasks: updatedSubtasks });
  }

  function handleDeleteSubtask(subtaskId, subtaskTitle) {
    if (!selectedTask) return;

    if (!window.confirm(
      `Do you really want to delete subtask "${subtaskTitle}" and all of its nested subtasks?`
    )) {
      return;
    }

    const updatedSubtasks = deleteSubtaskFromTree(selectedTask.subtasks || [], subtaskId);
    updateTask(selectedTask.id, { subtasks: updatedSubtasks });

    if (subtaskPath.includes(subtaskId)) {
      const idx = subtaskPath.indexOf(subtaskId);
      setSubtaskPath(subtaskPath.slice(0, idx));
    }
  }

  function handleUpdateSubtaskNote(subtaskId, notes) {
    if (!selectedTask) return;
    const updatedSubtasks = updateSubtaskInTree(selectedTask.subtasks || [], subtaskId, (st) => ({
      ...st,
      notes
    }));
    updateTask(selectedTask.id, { subtasks: updatedSubtasks });
  }

  function handleAddSubtaskLink(event) {
    if (event) event.preventDefault();
    if (!selectedTask || subtaskPath.length === 0) return;
    const currentSubtaskId = subtaskPath[subtaskPath.length - 1];

    const url = getReferenceUrl(subtaskReferenceDraft);
    if (!url) {
      alert('Enter a valid http or https reference link.');
      return;
    }

    const currentSubtask = findSubtask(selectedTask.subtasks || [], currentSubtaskId);
    const currentLinks = currentSubtask?.links && currentSubtask.links.length > 0
      ? currentSubtask.links
      : (currentSubtask?.link ? [currentSubtask.link] : []);

    if (currentLinks.includes(url)) {
      alert('This reference link has already been added.');
      return;
    }

    const nextLinks = [...currentLinks, url];
    const updatedSubtasks = updateSubtaskInTree(selectedTask.subtasks || [], currentSubtaskId, (st) => ({
      ...st,
      links: nextLinks,
      link: nextLinks[0] || ''
    }));
    updateTask(selectedTask.id, { subtasks: updatedSubtasks });
    setSubtaskReferenceDraft('');
  }

  function handleDeleteSubtaskLink(urlToDelete) {
    if (!selectedTask || subtaskPath.length === 0) return;
    const currentSubtaskId = subtaskPath[subtaskPath.length - 1];

    const currentSubtask = findSubtask(selectedTask.subtasks || [], currentSubtaskId);
    const currentLinks = currentSubtask?.links && currentSubtask.links.length > 0
      ? currentSubtask.links
      : (currentSubtask?.link ? [currentSubtask.link] : []);

    const nextLinks = currentLinks.filter((item) => item !== urlToDelete);
    const updatedSubtasks = updateSubtaskInTree(selectedTask.subtasks || [], currentSubtaskId, (st) => ({
      ...st,
      links: nextLinks,
      link: nextLinks[0] || ''
    }));
    updateTask(selectedTask.id, { subtasks: updatedSubtasks });
  }

  // Export tasks to JSON (Fully compatible with Android & Web)
  async function handleExportJSON() {
    try {
      const jsonData = JSON.stringify(tasks, null, 2);
      const filename = `student-tasks-backup-${new Date().toISOString().slice(0, 10)}.json`;

      // On Android / mobile WebView, use Web Share API to open system save/share dialog
      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          const file = new File([jsonData], filename, { type: 'application/json' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: 'Student Tasks Backup',
              text: 'Backup file for Student Task Manager',
              files: [file]
            });
            return;
          }
        } catch (shareErr) {
          if (shareErr.name === 'AbortError') return; // User cancelled
          console.warn('File share failed, attempting text share or blob fallback:', shareErr);
        }
      }

      // Desktop browser fallback
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export JSON error:', err);
      alert('Unable to export tasks. Please try again.');
    }
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
          (task.startTime === undefined || isValidTime(task.startTime)) &&
          (task.dueDate === undefined || typeof task.dueDate === 'string') &&
          (task.endTime === undefined || isValidTime(task.endTime)) &&
          (task.link === undefined || typeof task.link === 'string') &&
          (task.links === undefined || Array.isArray(task.links)) &&
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

          setTasks(importedTasks.map(normalizeTask));

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
    const currentSubtask = subtaskPath.length > 0
      ? findSubtask(selectedTask.subtasks || [], subtaskPath[subtaskPath.length - 1])
      : null;

    const currentSubtasksList = currentSubtask
      ? (currentSubtask.subtasks || [])
      : (selectedTask.subtasks || []);

    const currentSubtaskCounts = countSubtasksRecursive(currentSubtasksList);

    const breadcrumbs = [
      {
        title: selectedTask.title,
        onClick: () => {
          setSubtaskPath([]);
          setSubtaskReferenceDraft('');
        }
      }
    ];

    let searchList = selectedTask.subtasks || [];
    for (let i = 0; i < subtaskPath.length; i++) {
      const id = subtaskPath[i];
      const match = (searchList || []).find((s) => s.id === id);
      if (match) {
        const isLast = i === subtaskPath.length - 1;
        breadcrumbs.push({
          title: match.title,
          isCurrent: isLast,
          onClick: isLast
            ? undefined
            : () => {
              setSubtaskPath(subtaskPath.slice(0, i + 1));
              setSubtaskReferenceDraft(match.link || '');
            }
        });
        searchList = match.subtasks || [];
      }
    }

    return (
      <main className="app-container">
        <section className="task-section task-detail">
          {subtaskPath.length > 0 ? (
            <button
              type="button"
              className="back-btn"
              onClick={() => {
                const nextPath = subtaskPath.slice(0, -1);
                setSubtaskPath(nextPath);
                if (nextPath.length > 0) {
                  const parentSub = findSubtask(selectedTask.subtasks || [], nextPath[nextPath.length - 1]);
                  setSubtaskReferenceDraft(parentSub?.link || '');
                } else {
                  setSubtaskReferenceDraft('');
                }
              }}
            >
              ← Back to {breadcrumbs[breadcrumbs.length - 2]?.title || selectedTask.title}
            </button>
          ) : (
            <button
              type="button"
              className="back-btn"
              onClick={() => {
                setSelectedTaskId(null);
                setSubtaskPath([]);
                setSubtaskInput('');
              }}
            >
              ← Back to tasks
            </button>
          )}

          {/* Breadcrumb Hierarchy */}
          <nav className="breadcrumbs" aria-label="Task Hierarchy">
            {breadcrumbs.map((crumb, idx) => (
              <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                {idx > 0 && <span className="breadcrumb-separator">›</span>}
                {crumb.isCurrent ? (
                  <span className="breadcrumb-current">{crumb.title}</span>
                ) : (
                  <button
                    type="button"
                    className="breadcrumb-btn"
                    onClick={crumb.onClick}
                  >
                    {crumb.title}
                  </button>
                )}
              </span>
            ))}
          </nav>

          {currentSubtask ? (
            <>
              <header className="task-detail-header">
                <div>
                  <p className="task-detail-eyebrow">Subtask (Level {subtaskPath.length})</p>
                  <h1>{currentSubtask.title}</h1>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="theme-toggle-btn"
                    onClick={toggleTheme}
                    aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                    title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  >
                    {theme === 'dark' ? '☀️' : '🌙'}
                  </button>
                  <button
                    type="button"
                    className={currentSubtask.completed ? 'detail-status-btn completed' : 'detail-status-btn'}
                    onClick={() => handleToggleSubtask(currentSubtask.id)}
                  >
                    {currentSubtask.completed ? '✓ Completed' : '○ In progress'}
                  </button>
                </div>
              </header>

              <form className="reference-form" onSubmit={handleAddSubtaskLink}>
                <label className="detail-label" htmlFor="subtask-reference">Reference links</label>
                <div className="link-input-group">
                  <input
                    id="subtask-reference"
                    type="url"
                    placeholder="https://youtube.com/..., https://instagram.com/..."
                    value={subtaskReferenceDraft}
                    onChange={(event) => setSubtaskReferenceDraft(event.target.value)}
                  />
                  <button type="submit" className="category-add-btn">+ Add link</button>
                </div>
              </form>

              {(() => {
                const allLinks = (currentSubtask.links && currentSubtask.links.length > 0)
                  ? currentSubtask.links
                  : (currentSubtask.link ? [currentSubtask.link] : []);
                if (allLinks.length === 0) return null;
                return (
                  <div className="link-badge-container" style={{ margin: '8px 0 16px' }}>
                    {allLinks.map((url) => (
                      <LinkBadge
                        key={url}
                        url={url}
                        onDelete={() => handleDeleteSubtaskLink(url)}
                      />
                    ))}
                  </div>
                );
              })()}

              <label className="detail-label" htmlFor="subtask-notes">Notes</label>
              <textarea
                id="subtask-notes"
                className="task-notes"
                placeholder="Write your notes about this subtask..."
                value={currentSubtask.notes || ''}
                onChange={(event) => handleUpdateSubtaskNote(currentSubtask.id, event.target.value)}
              />
            </>
          ) : (
            <>
              <header className="task-detail-header">
                <div>
                  <p className="task-detail-eyebrow">Task notes</p>
                  <h1>{selectedTask.title}</h1>
                  <div className="task-meta">
                    <span className="category-label">{selectedTask.category}</span>
                    {selectedTask.startDate && (
                      <span className="date-label">
                        Starts: {selectedTask.startDate} at {selectedTask.startTime || DEFAULT_REMINDER_TIME}
                      </span>
                    )}
                    {selectedTask.dueDate && (
                      <span className={isTaskOverdue(selectedTask) ? 'date-label overdue' : 'date-label'}>
                        Deadline: {selectedTask.dueDate} at {selectedTask.dueTime || selectedTask.endTime || DEFAULT_REMINDER_TIME}
                      </span>
                    )}
                    {isTaskOverdue(selectedTask) && (
                      <span className="overdue-tag">🚨 Overdue</span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="theme-toggle-btn"
                    onClick={toggleTheme}
                    aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                    title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  >
                    {theme === 'dark' ? '☀️' : '🌙'}
                  </button>
                  <span className={selectedTask.completed ? 'detail-status completed' : 'detail-status'}>
                    {selectedTask.completed ? 'Completed' : 'In progress'}
                  </span>
                </div>
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
                  Start time
                  <input
                    type="time"
                    value={taskDateDraft.startTime}
                    onChange={(event) => setTaskDateDraft((dates) => ({
                      ...dates,
                      startTime: event.target.value
                    }))}
                  />
                </label>
                <label>
                  Due date (Deadline)
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
                <label>
                  Due time
                  <input
                    type="time"
                    value={taskDateDraft.endTime}
                    onChange={(event) => setTaskDateDraft((dates) => ({
                      ...dates,
                      endTime: event.target.value
                    }))}
                  />
                </label>
                <button type="submit" className="category-add-btn">Save dates &amp; reminders</button>
              </form>

              <form className="reference-form" onSubmit={handleAddTaskLink}>
                <label className="detail-label" htmlFor="task-reference">Reference links</label>
                <div className="link-input-group">
                  <input
                    id="task-reference"
                    type="url"
                    placeholder="https://youtube.com/..., https://instagram.com/..."
                    value={taskReferenceDraft}
                    onChange={(event) => setTaskReferenceDraft(event.target.value)}
                  />
                  <button type="submit" className="category-add-btn">+ Add link</button>
                </div>
              </form>

              {(() => {
                const allLinks = (selectedTask.links && selectedTask.links.length > 0)
                  ? selectedTask.links
                  : (selectedTask.link ? [selectedTask.link] : []);
                if (allLinks.length === 0) return null;
                return (
                  <div className="link-badge-container" style={{ margin: '8px 0 16px' }}>
                    {allLinks.map((url) => (
                      <LinkBadge
                        key={url}
                        url={url}
                        onDelete={() => handleDeleteTaskLink(url)}
                      />
                    ))}
                  </div>
                );
              })()}

              <label className="detail-label" htmlFor="task-notes">Notes</label>
              <textarea
                id="task-notes"
                className="task-notes"
                placeholder="Write your notes about this task..."
                value={selectedTask.notes || ''}
                onChange={(event) => updateTask(selectedTask.id, { notes: event.target.value })}
              />
            </>
          )}

          {/* Subtasks Section (Available at both root task and any subtask level!) */}
          <section className="subtasks-section" aria-labelledby="subtasks-title">
            <div className="subtasks-heading">
              <div>
                <h2 id="subtasks-title">
                  {currentSubtask ? `Subtasks of "${currentSubtask.title}"` : 'Subtasks'}
                </h2>
                <p>Break this {currentSubtask ? 'subtask' : 'task'} into smaller steps.</p>
              </div>
              <span className="subtask-count">
                {currentSubtasksList.filter((item) => item.completed).length}/{currentSubtasksList.length}
                {currentSubtaskCounts.total > currentSubtasksList.length && (
                  <span style={{ marginLeft: '6px', fontSize: '12px', color: '#64748b' }}>
                    ({currentSubtaskCounts.completed}/{currentSubtaskCounts.total} total nested)
                  </span>
                )}
              </span>
            </div>

            <form className="subtask-form" onSubmit={handleAddSubtask}>
              <input
                type="text"
                aria-label="New subtask"
                placeholder={currentSubtask ? `Add subtask to "${currentSubtask.title}"...` : 'Add a subtask...'}
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

            {currentSubtasksList.length > 0 ? (
              <ul className="subtask-list">
                {currentSubtasksList.map((subtask) => {
                  const nestedCounts = countSubtasksRecursive(subtask.subtasks || []);
                  return (
                    <li className="subtask-item" key={subtask.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={subtask.completed}
                          onChange={() => handleToggleSubtask(subtask.id)}
                        />
                      </label>
                      <button
                        type="button"
                        className={`subtask-title-btn${subtask.completed ? ' subtask-completed' : ''}`}
                        onClick={() => {
                          setSubtaskPath([...subtaskPath, subtask.id]);
                          setSubtaskReferenceDraft(subtask.link || '');
                        }}
                      >
                        <span>
                          {subtask.title}
                        </span>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                          {nestedCounts.total > 0 && (
                            <span className="subtask-badge">
                              📁 {nestedCounts.total} {nestedCounts.total === 1 ? 'subtask' : 'subtasks'} ({nestedCounts.completed}/{nestedCounts.total})
                            </span>
                          )}
                          {subtask.notes && (
                            <span className="subtask-note-indicator">📝 Note</span>
                          )}
                          <span className="subtask-note-indicator" style={{ color: '#2563eb' }}>
                            Open subtask →
                          </span>
                        </div>
                      </button>
                      {(() => {
                        const allLinks = (subtask.links && subtask.links.length > 0)
                          ? subtask.links
                          : (subtask.link ? [subtask.link] : []);
                        if (allLinks.length === 0) return null;
                        return (
                          <div className="link-badge-container compact">
                            {allLinks.map((url) => (
                              <LinkBadge key={url} url={url} compact />
                            ))}
                          </div>
                        );
                      })()}
                      <button
                        type="button"
                        className="subtask-delete-btn"
                        onClick={() => handleDeleteSubtask(subtask.id, subtask.title)}
                        aria-label={`Delete subtask ${subtask.title}`}
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="subtasks-empty">No subtasks yet. Add one above!</p>
            )}
          </section>
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
            {/* {notificationStatus && (
              <p className="notification-status" role="status">{notificationStatus}</p>
            )} */}
          </div>

          <div className="header-actions">
            <button
              type="button"
              className="theme-toggle-btn"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
            </button>
            <div className="header-icon">
              🎯
            </div>
          </div>
        </div>
      </header>

      {/* Notification Controls */}
      <div className="notification-controls">
        <button
          type="button"
          className="notification-button"
          onClick={requestNotificationPermission}
        >
          🔔 Enable notifications
        </button>
        <button
          type="button"
          className="notification-test-btn"
          onClick={handleTestNotification}
        >
          ⚡ Test 10s Notification
        </button>
        <button
          type="button"
          className="notification-settings-btn"
          onClick={() => setShowSettings(!showSettings)}
        >
          ⚙️ Notification Settings
        </button>
      </div>

      {/* Notification Settings Panel */}
      {showSettings && (
        <section className="settings-panel" aria-labelledby="settings-heading">
          <div className="settings-header">
            <h3 id="settings-heading">⚙️ Notification Preferences</h3>
            <button
              type="button"
              className="settings-close-btn"
              onClick={() => setShowSettings(false)}
              aria-label="Close settings"
            >
              ✕
            </button>
          </div>

          <div className="settings-grid">
            <label className="setting-toggle">
              <input
                type="checkbox"
                checked={notificationSettings.enabled}
                onChange={(e) => setNotificationSettings((s) => ({ ...s, enabled: e.target.checked }))}
              />
              <span><strong>Enable All Notifications</strong></span>
            </label>

            <label className="setting-toggle">
              <input
                type="checkbox"
                disabled={!notificationSettings.enabled}
                checked={notificationSettings.reminder1Day}
                onChange={(e) => setNotificationSettings((s) => ({ ...s, reminder1Day: e.target.checked }))}
              />
              <span>📚 1 Day Before Deadline</span>
            </label>

            <label className="setting-toggle">
              <input
                type="checkbox"
                disabled={!notificationSettings.enabled}
                checked={notificationSettings.reminder1Hour}
                onChange={(e) => setNotificationSettings((s) => ({ ...s, reminder1Hour: e.target.checked }))}
              />
              <span>⏰ 1 Hour Before Deadline</span>
            </label>

            <label className="setting-toggle">
              <input
                type="checkbox"
                disabled={!notificationSettings.enabled}
                checked={notificationSettings.reminder15Min}
                onChange={(e) => setNotificationSettings((s) => ({ ...s, reminder15Min: e.target.checked }))}
              />
              <span>🚨 15 Minutes Before Deadline</span>
            </label>

            <label className="setting-toggle">
              <input
                type="checkbox"
                disabled={!notificationSettings.enabled}
                checked={notificationSettings.reminderAtDeadline}
                onChange={(e) => setNotificationSettings((s) => ({ ...s, reminderAtDeadline: e.target.checked }))}
              />
              <span>⌛ Exact Deadline Alert</span>
            </label>

            <label className="setting-toggle">
              <input
                type="checkbox"
                disabled={!notificationSettings.enabled}
                checked={notificationSettings.overdueAlerts}
                onChange={(e) => setNotificationSettings((s) => ({ ...s, overdueAlerts: e.target.checked }))}
              />
              <span>⚠️ Overdue Alerts &amp; Badges</span>
            </label>

            <div className="setting-group">
              <label className="setting-toggle">
                <input
                  type="checkbox"
                  disabled={!notificationSettings.enabled}
                  checked={notificationSettings.dailySummary}
                  onChange={(e) => setNotificationSettings((s) => ({ ...s, dailySummary: e.target.checked }))}
                />
                <span>🌅 Daily Morning Summary</span>
              </label>

              {notificationSettings.dailySummary && (
                <div className="setting-subinput">
                  <label htmlFor="daily-time-input">Delivery Time:</label>
                  <input
                    id="daily-time-input"
                    type="time"
                    value={notificationSettings.dailySummaryTime || '08:00'}
                    onChange={(e) => setNotificationSettings((s) => ({ ...s, dailySummaryTime: e.target.value }))}
                  />
                </div>
              )}
            </div>

            <label className="setting-toggle">
              <input
                type="checkbox"
                disabled={!notificationSettings.enabled}
                checked={notificationSettings.vibration}
                onChange={(e) => setNotificationSettings((s) => ({ ...s, vibration: e.target.checked }))}
              />
              <span>📳 Vibration Alerts</span>
            </label>
          </div>
        </section>
      )}

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
            placeholder="Enter your task title..."
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddTask();
            }}
          />
          <input
            type="text"
            placeholder="Description / notes (optional)"
            aria-label="Task description"
            value={taskNotesInput}
            onChange={(e) => setTaskNotesInput(e.target.value)}
          />
          <div className="link-input-group">
            <input
              type="url"
              placeholder="Reference link (e.g. YouTube, Instagram, GitHub...)"
              aria-label="Task reference link"
              value={taskLink}
              onChange={(e) => setTaskLink(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddCreationLink();
                }
              }}
            />
            <button
              type="button"
              className="link-add-inline-btn"
              onClick={handleAddCreationLink}
              title="Add reference link"
            >
              + Link
            </button>
          </div>
          {taskLinks.length > 0 && (
            <div className="link-badge-container">
              {taskLinks.map((url) => (
                <LinkBadge
                  key={url}
                  url={url}
                  onDelete={(u) => setTaskLinks((prev) => prev.filter((item) => item !== u))}
                />
              ))}
            </div>
          )}

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
            Start time
            <input
              type="time"
              aria-label="Task start time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </label>

          <label className="date-input-label">
            Due date (Deadline)
            <input
              type="date"
              aria-label="Task deadline date"
              min={startDate || undefined}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </label>
          <label className="date-input-label">
            Due time
            <input
              type="time"
              aria-label="Task due time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </label>

          <button onClick={handleAddTask}>
            Add Task
          </button>

        </div>
        <p className="reminder-help">
          Reminders use the selected start and end times in your device&apos;s local time zone.
          Mobile reminders are scheduled by the OS. Web reminders require this page to stay open,
          and browser or OS background limits may delay delivery.
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
                        setSubtaskPath([]);
                        setTaskReferenceDraft(task.link || '');
                        setTaskDateDraft({
                          startDate: task.startDate || '',
                          startTime: task.startTime || DEFAULT_REMINDER_TIME,
                          dueDate: task.dueDate || '',
                          endTime: task.endTime || DEFAULT_REMINDER_TIME
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
                          Starts: {task.startDate} at {task.startTime || DEFAULT_REMINDER_TIME}
                        </span>
                      )}

                      {task.dueDate && (
                        <span className={isTaskOverdue(task) ? 'date-label overdue' : 'date-label'}>
                          Deadline: {task.dueDate} at {task.dueTime || task.endTime || DEFAULT_REMINDER_TIME}
                        </span>
                      )}

                      {isTaskOverdue(task) && (
                        <span className="overdue-tag">🚨 Overdue</span>
                      )}

                      {(() => {
                        const counts = countSubtasksRecursive(task.subtasks || []);
                        return counts.total > 0 ? (
                          <span className="subtask-badge">
                            📋 {counts.completed}/{counts.total} subtasks
                          </span>
                        ) : null;
                      })()}

                      {(() => {
                        const allLinks = (task.links && task.links.length > 0)
                          ? task.links
                          : (task.link ? [task.link] : []);
                        if (allLinks.length === 0) return null;
                        return (
                          <div className="link-badge-container compact">
                            {allLinks.map((url) => (
                              <LinkBadge key={url} url={url} compact />
                            ))}
                          </div>
                        );
                      })()}

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
