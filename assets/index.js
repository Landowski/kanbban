const CLIENT_ID = '1096932758704-s3bk9oo6pcgi03muahuk1u4ejrh2lab6.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file profile email';
let API_KEY = '';
let tokenClient;
let gapiInited = false;
let gisInited = false;
let authInProgress = false;

async function fetchApiKey() {
    try {
        const response = await fetch('https://c6a1xt2tzi.execute-api.us-east-1.amazonaws.com/prod/apiKanbban', {
            mode: 'cors',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        API_KEY = data.apiKey;
    } catch (error) {
        console.error("Error fetching API_KEY:", error);
    }
}

function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
    try { 
        await gapi.client.init({
            apiKey: API_KEY,
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
        });
    gapiInited = true;
    maybeEnableLoginButton();
    } catch (error) {
        console.error('Error when initializing gapi.client:', error);
    }
}

function gisLoaded() {
    try {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: '',
        });
        gisInited = true;
        maybeEnableLoginButton();
    } catch (error) {
        console.error('Error when initializing GIS:', error);
    }
}

function maybeEnableLoginButton() {
    if (gapiInited && gisInited) {
        document.getElementById('loginBtn').style.display = 'flex';
    }
}

function handleAuthClick() {
    authInProgress = false;
    const popupWidth = 500;
    const popupHeight = 600;
    const left = Math.round((window.innerWidth - popupWidth) / 2) + window.screenX;
    const top = Math.round((window.innerHeight - popupHeight) / 2) + window.screenY;
    const popupOptions = {
        width: popupWidth,
        height: popupHeight,
        left: left,
        top: top
    };
    const originalOpen = window.open;
    window.open = function(url, title, features) {
        const customFeatures = `width=${popupWidth},height=${popupHeight},left=${left},top=${top},resizable=yes,scrollbars=yes`;
        const popupWindow = originalOpen.call(this, url, title, customFeatures);
        window.open = originalOpen;
        return popupWindow;
    };
    tokenClient.callback = async (resp) => {
        authInProgress = false;
        if (resp.error === "popup_closed") return;
        if (resp.error !== undefined) {
            alert('Error logging in: ' + resp.error);
            return;
        }
        const token = gapi.client.getToken();
        localStorage.setItem('gapi_token_kanbban', JSON.stringify(token));
        const userInfo = await fetchUserInfo();
        localStorage.setItem('googleUser_kanbban', JSON.stringify(userInfo));
        setTimeout(() => {
            window.location.href = 'app';
        }, 50);
    };
    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        tokenClient.requestAccessToken({ prompt: '' });
    }
}

async function fetchUserInfo() {
    try {
        const token = gapi.client.getToken();
        if (!token) {
            throw new Error('Token not available');
        }
        
        const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: {
                'Authorization': `Bearer ${token.access_token}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Error getting user information');
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error getting user information:', error);
        return {
            name: 'User',
            email: 'email@example.com'
        };
    }
}

let kanbanData = {
    projects: [],
    currentProjectId: null,
    currentBoardId: null
};

const loginBtn = document.getElementById('loginBtn');
const loadingMessage = document.getElementById("loading-message");
const welcomeMessage = document.getElementById('welcome-message');
const sidebarHeader = document.getElementById('homeBtn');
const projectsList = document.getElementById('projects-list');
const newProjectBtn = document.getElementById('new-project-btn');
const currentProjectTitle = document.getElementById('current-project-title');
const kanbanContainer = document.getElementById('kanban-container');
const newBoardBtn = document.getElementById('new-board-btn');

const projectModal = document.getElementById('project-modal');
const projectNameInput = document.getElementById('project-name-input');
const createProjectBtn = document.getElementById('create-project-btn');
const cancelProjectBtn = document.getElementById('cancel-project-btn');

const projectEditModal = document.getElementById('project-edit-modal');
const projectEditInput = document.getElementById('project-edit-input');
const confirmProjectEditBtn = document.getElementById('confirm-project-edit-btn');
const cancelProjectEditBtn = document.getElementById('cancel-project-edit-btn');

const projectDeleteModal = document.getElementById('project-delete-modal');
const confirmProjectDeleteBtn = document.getElementById('confirm-project-delete-btn');
const cancelProjectDeleteBtn = document.getElementById('cancel-project-delete-btn');

const boardModal = document.getElementById('board-modal');
const boardNameInput = document.getElementById('board-name-input');
const createBoardBtn = document.getElementById('create-board-btn');
const cancelBoardBtn = document.getElementById('cancel-board-btn');

const boardEditModal = document.getElementById('board-edit-modal');
const boardEditInput = document.getElementById('board-edit-input');
const confirmEditBtn = document.getElementById('confirm-edit-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');

const boardDeleteModal = document.getElementById('board-delete-modal');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');

loginBtn.addEventListener('click', handleAuthClick);

function loadData() {
    const savedData = localStorage.getItem('kanbanData');
    if (savedData) {
        kanbanData = JSON.parse(savedData);
        renderProjects();
        initProjectsSortable();
    }
    showWelcomeMessage();
}

function showWelcomeMessage() {
    welcomeMessage.style.display = 'block';
    kanbanContainer.classList.remove('active');
    currentProjectTitle.textContent = 'Kanban App';
    newBoardBtn.style.display = 'none';
    kanbanData.currentProjectId = null;
    saveData();
    document.querySelectorAll('.project-item').forEach(item => {
        item.classList.remove('active');
    });

    const existingProgressBar = document.querySelector('.progress-container');
    if (existingProgressBar) {
        existingProgressBar.remove();
    }
}

function showProjectContent(projectId) {
    welcomeMessage.style.display = 'none';
    kanbanContainer.classList.add('active');
    newBoardBtn.style.display = 'flex';
    const project = kanbanData.projects.find(p => p.id === projectId);
    if (project) {
        currentProjectTitle.textContent = project.name;
        const progressBarContainer = document.createElement('div');
        progressBarContainer.className = 'progress-container';
        progressBarContainer.innerHTML = `
            <div class="progress-bar">
                <div class="progress-fill" style="width: 0%"></div>
            </div>
            <div class="progress-text">0%</div>
        `;
        const projectTitleContainer = document.getElementById('current-project-title').parentNode;
        const existingProgressBar = document.querySelector('.progress-container');
        if (existingProgressBar) {
            existingProgressBar.remove();
        }
        projectTitleContainer.appendChild(progressBarContainer);
        updateProgressBar(project.id);
        renderBoards();
    }
}

function updateProgressBar(projectId) {
    const project = kanbanData.projects.find(p => p.id === projectId);
    if (!project) return;

    let percentage = 0;

    if (project.boards.length > 0) {
        let totalTasks = 0;
        project.boards.forEach(board => {
            totalTasks += board.tasks.length;
        });
        const lastBoardTasks = project.boards[project.boards.length - 1].tasks.length;
        if (totalTasks > 0) {
            percentage = Math.round((lastBoardTasks / totalTasks) * 100);
        }
    }
    const progressFill = document.querySelector('.progress-fill');
    const progressText = document.querySelector('.progress-text');
    if (progressFill && progressText) {
        progressFill.style.width = `${percentage}%`;
        progressText.textContent = `${percentage}%`;
    }
    if (percentage === 100) {
    triggerConfetti();
    }
}

function saveData() {
    localStorage.setItem('kanbanData', JSON.stringify(kanbanData));
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}

function renderProjects() {
    projectsList.innerHTML = '';
    kanbanData.projects.forEach(project => {
        const projectElement = createProjectElement(project);
        projectsList.appendChild(projectElement);
    });
}

function createProjectElement(project) {
    const projectElement = document.createElement('div');
    projectElement.className = `project-item ${project.id === kanbanData.currentProjectId ? 'active' : ''}`;
    projectElement.dataset.projectId = project.id;
    const projectHandleNameGroup = document.createElement('div');
    projectHandleNameGroup.className = 'project-handle-name-group';
    const dragHandle = document.createElement('div');
    dragHandle.className = 'project-drag-handle';
    dragHandle.innerHTML = '⠿';
    dragHandle.setAttribute('aria-label', 'Arrastar para reordenar');
    const projectName = document.createElement('div');
    projectName.className = 'project-name';
    projectName.textContent = project.name;
    const menuIcon = document.createElement('div');
    menuIcon.className = 'project-menu-icon';
    menuIcon.innerHTML = `
        <div class="menu-dots">
            <div class="menu-dot"></div>
            <div class="menu-dot"></div>
            <div class="menu-dot"></div>
        </div>
    `;
    const projectMenu = document.createElement('div');
    projectMenu.className = 'project-menu';
    projectMenu.innerHTML = `
        <div class="menu-item menu-edit"><svg  xmlns="http://www.w3.org/2000/svg"  width="20"  height="20"  viewBox="0 0 24 24"  fill="currentColor" style="margin-top: -3px;"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M17.828 2a3 3 0 0 1 1.977 .743l.145 .136l1.171 1.17a3 3 0 0 1 .136 4.1l-.136 .144l-1.706 1.707l2.292 2.293a1 1 0 0 1 .083 1.32l-.083 .094l-4 4a1 1 0 0 1 -1.497 -1.32l.083 -.094l3.292 -3.293l-1.586 -1.585l-7.464 7.464a3.828 3.828 0 0 1 -2.474 1.114l-.233 .008c-.674 0 -1.33 -.178 -1.905 -.508l-1.216 1.214a1 1 0 0 1 -1.497 -1.32l.083 -.094l1.214 -1.216a3.828 3.828 0 0 1 .454 -4.442l.16 -.17l10.586 -10.586a3 3 0 0 1 1.923 -.873l.198 -.006zm0 2a1 1 0 0 0 -.608 .206l-.099 .087l-1.707 1.707l2.586 2.585l1.707 -1.706a1 1 0 0 0 .284 -.576l.01 -.131a1 1 0 0 0 -.207 -.609l-.087 -.099l-1.171 -1.171a1 1 0 0 0 -.708 -.293z" /></svg>Edit</div>
        <div class="menu-item menu-delete"><svg  xmlns="http://www.w3.org/2000/svg"  width="20"  height="20"  viewBox="0 0 24 24"  fill="currentColor" style="margin-top: -3px;"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 6a1 1 0 0 1 .117 1.993l-.117 .007h-.081l-.919 11a3 3 0 0 1 -2.824 2.995l-.176 .005h-8c-1.598 0 -2.904 -1.249 -2.992 -2.75l-.005 -.167l-.923 -11.083h-.08a1 1 0 0 1 -.117 -1.993l.117 -.007h16z" /><path d="M14 2a2 2 0 0 1 2 2a1 1 0 0 1 -1.993 .117l-.007 -.117h-4l-.007 .117a1 1 0 0 1 -1.993 -.117a2 2 0 0 1 1.85 -1.995l.15 -.005h4z" /></svg>Delete</div>
    `;
    projectHandleNameGroup.appendChild(dragHandle);
    projectHandleNameGroup.appendChild(projectName);
    menuIcon.appendChild(projectMenu);
    projectElement.appendChild(projectHandleNameGroup);
    projectElement.appendChild(menuIcon);

    projectElement.addEventListener('click', (e) => {
        if (!e.target.closest('.project-menu-icon') && !e.target.closest('.project-drag-handle')) {
            selectProject(project.id);
        }
    });
    
    menuIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        projectMenu.classList.toggle('active');
    });
    
    projectMenu.querySelector('.menu-edit').addEventListener('click', () => {
        openEditProjectModal(project);
    });
    
    projectMenu.querySelector('.menu-delete').addEventListener('click', () => {
        openDeleteProjectModal(project);
    });
    
    return projectElement;
}

function selectProject(projectId) {
    if (kanbanData.currentProjectId === projectId) {
        return;
    }
    document.querySelectorAll('.project-item').forEach(item => {
        item.classList.remove('active');
    });
    kanbanData.currentProjectId = projectId;
    saveData();
    const selectedProject = document.querySelector(`.project-item[data-project-id="${projectId}"]`);
    if (selectedProject) {
        selectedProject.classList.add('active');
    }
    showProjectContent(projectId);
}

sidebarHeader.addEventListener('click', () => {
    if (kanbanData.currentProjectId) {
        const currentProjectElement = document.querySelector(`.project-item[data-project-id="${kanbanData.currentProjectId}"]`);
        if (currentProjectElement) {
            currentProjectElement.classList.remove('active');
        }
        showWelcomeMessage();
        kanbanData.currentProjectId = null;
        saveData();
    }
});

function renderBoards() {
    kanbanContainer.innerHTML = '';
    
    if (!kanbanData.currentProjectId) {
        showWelcomeMessage();
        return;
    }
    
    const project = kanbanData.projects.find(p => p.id === kanbanData.currentProjectId);
    if (!project) {
        showWelcomeMessage();
        return;
    }
    
    project.boards.forEach(board => {
        const boardElement = createBoardElement(board);
        kanbanContainer.appendChild(boardElement);
    });
    
    document.querySelectorAll('.tasks-container').forEach(container => {
        initSortable(container);
    });
}

function createBoardElement(board) {
    const boardElement = document.createElement('div');
    boardElement.className = 'board';
    boardElement.id = `board-${board.id}`;
    boardElement.dataset.boardId = board.id;
    const boardHeader = document.createElement('div');
    boardHeader.className = 'board-header';
    const boardTitle = document.createElement('div');
    boardTitle.className = 'board-title';
    boardTitle.textContent = board.name;
    const menuIcon = document.createElement('div');
    menuIcon.className = 'menu-icon';
    menuIcon.innerHTML = `
        <div class="menu-dots">
            <div class="menu-dot"></div>
            <div class="menu-dot"></div>
            <div class="menu-dot"></div>
        </div>
    `;
    const boardMenu = document.createElement('div');
    boardMenu.className = 'board-menu';
    boardMenu.innerHTML = `
        <div class="board-color-picker">
            <div class="color-row">
                <div class="color-choice" data-color="#FFCDD2" style="background:#FFCDD2"></div>
                <div class="color-choice" data-color="#F8BBD0" style="background:#F8BBD0"></div>
                <div class="color-choice" data-color="#E1BEE7" style="background:#E1BEE7"></div>
                <div class="color-choice" data-color="#D1C4E9" style="background:#D1C4E9"></div>
                <div class="color-choice" data-color="#C5CAE9" style="background:#C5CAE9"></div>
                <div class="color-choice" data-color="#BBDEFB" style="background:#BBDEFB"></div>
            </div>
            <div class="color-row">
                <div class="color-choice" data-color="#B3E5FC" style="background:#B3E5FC"></div>
                <div class="color-choice" data-color="#B2EBF2" style="background:#B2EBF2"></div>
                <div class="color-choice" data-color="#B2DFDB" style="background:#B2DFDB"></div>
                <div class="color-choice" data-color="#C8E6C9" style="background:#C8E6C9"></div>
                <div class="color-choice" data-color="#DCEDC8" style="background:#DCEDC8"></div>
                <div class="color-choice" data-color="#F0F4C3" style="background:#F0F4C3"></div>
            </div>
            <div class="color-row">
                <div class="color-choice" data-color="#FFF9C4" style="background:#FFF9C4"></div>
                <div class="color-choice" data-color="#FFECB3" style="background:#FFECB3"></div>
                <div class="color-choice" data-color="#FFE0B2" style="background:#FFE0B2"></div>
                <div class="color-choice" data-color="#FFCCBC" style="background:#FFCCBC"></div>
                <div class="color-choice" data-color="#D7CCC8" style="background:#D7CCC8"></div>
                <div class="color-choice" data-color="#CFD8DC" style="background:#CFD8DC"></div>
            </div>

            <div class="color-row">
                <div class="color-choice" data-color="#d5dae1" style="background:#d5dae1"></div>
                <div class="color-choice" data-color="#F44336" style="background:#F44336"></div>
                <div class="color-choice" data-color="#E91E63" style="background:#E91E63"></div>
                <div class="color-choice" data-color="#9C27B0" style="background:#9C27B0"></div>
                <div class="color-choice" data-color="#3F51B5" style="background:#3F51B5"></div>
                <div class="color-choice" data-color="#2196F3" style="background:#2196F3"></div>
            </div>
            <div class="color-row">
                <div class="color-choice" data-color="#03A9F4" style="background:#03A9F4"></div>
                <div class="color-choice" data-color="#00BCD4" style="background:#00BCD4"></div>
                <div class="color-choice" data-color="#009688" style="background:#009688"></div>
                <div class="color-choice" data-color="#4CAF50" style="background:#4CAF50"></div>
                <div class="color-choice" data-color="#8BC34A" style="background:#8BC34A"></div>
                <div class="color-choice" data-color="#CDDC39" style="background:#CDDC39"></div>
            </div>
            <div class="color-row">
                <div class="color-choice" data-color="#FFEB3B" style="background:#FFEB3B"></div>
                <div class="color-choice" data-color="#FFC107" style="background:#FFC107"></div>
                <div class="color-choice" data-color="#FF9800" style="background:#FF9800"></div>
                <div class="color-choice" data-color="#FF5722" style="background:#FF5722"></div>
                <div class="color-choice" data-color="#795548" style="background:#795548"></div>
                <div class="color-choice" data-color="#9E9E9E" style="background:#9E9E9E"></div>
            </div>
        </div>
        <div class="menu-item menu-edit"><svg  xmlns="http://www.w3.org/2000/svg"  width="20"  height="20"  viewBox="0 0 24 24"  fill="currentColor" style="margin-top: -3px;"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M17.828 2a3 3 0 0 1 1.977 .743l.145 .136l1.171 1.17a3 3 0 0 1 .136 4.1l-.136 .144l-1.706 1.707l2.292 2.293a1 1 0 0 1 .083 1.32l-.083 .094l-4 4a1 1 0 0 1 -1.497 -1.32l.083 -.094l3.292 -3.293l-1.586 -1.585l-7.464 7.464a3.828 3.828 0 0 1 -2.474 1.114l-.233 .008c-.674 0 -1.33 -.178 -1.905 -.508l-1.216 1.214a1 1 0 0 1 -1.497 -1.32l.083 -.094l1.214 -1.216a3.828 3.828 0 0 1 .454 -4.442l.16 -.17l10.586 -10.586a3 3 0 0 1 1.923 -.873l.198 -.006zm0 2a1 1 0 0 0 -.608 .206l-.099 .087l-1.707 1.707l2.586 2.585l1.707 -1.706a1 1 0 0 0 .284 -.576l.01 -.131a1 1 0 0 0 -.207 -.609l-.087 -.099l-1.171 -1.171a1 1 0 0 0 -.708 -.293z" /></svg>Editar</div>
        <div class="menu-item menu-delete"><svg  xmlns="http://www.w3.org/2000/svg"  width="20"  height="20"  viewBox="0 0 24 24"  fill="currentColor" style="margin-top: -3px;"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 6a1 1 0 0 1 .117 1.993l-.117 .007h-.081l-.919 11a3 3 0 0 1 -2.824 2.995l-.176 .005h-8c-1.598 0 -2.904 -1.249 -2.992 -2.75l-.005 -.167l-.923 -11.083h-.08a1 1 0 0 1 -.117 -1.993l.117 -.007h16z" /><path d="M14 2a2 2 0 0 1 2 2a1 1 0 0 1 -1.993 .117l-.007 -.117h-4l-.007 .117a1 1 0 0 1 -1.993 -.117a2 2 0 0 1 1.85 -1.995l.15 -.005h4z" /></svg>Excluir</div>
    `;
    
    menuIcon.appendChild(boardMenu);
    boardHeader.appendChild(boardTitle);
    boardHeader.appendChild(menuIcon);
    const taskForm = document.createElement('form');
    taskForm.className = 'task-form';
    taskForm.innerHTML = `
        <input type="text" class="task-input" placeholder="Add task">`;
    const tasksContainer = document.createElement('div');
    tasksContainer.className = 'tasks-container';
    tasksContainer.dataset.boardId = board.id;
    board.tasks.forEach(task => {
        const taskElement = createTaskElement(task);
        tasksContainer.appendChild(taskElement);
    });
    boardElement.appendChild(boardHeader);
    boardElement.appendChild(taskForm);
    boardElement.appendChild(tasksContainer);

    menuIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        boardMenu.classList.toggle('active');
    });
    
    document.addEventListener('click', () => {
        boardMenu.classList.remove('active');
    });
    
    boardMenu.querySelector('.menu-edit').addEventListener('click', () => {
        openEditBoardModal(board);
    });
    
    boardMenu.querySelector('.menu-delete').addEventListener('click', () => {
        openDeleteBoardModal(board);
    });
    
    taskForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = taskForm.querySelector('.task-input');
        const taskContent = input.value.trim();
        
        if (taskContent) {
            addTaskToBoard(board.id, taskContent);
            input.value = '';
        }
    });

    const savedColor = board.color || "#d5dae1";
    boardHeader.style.backgroundColor = savedColor;

    boardMenu.querySelectorAll('.color-choice').forEach(choice => {
        choice.addEventListener('click', (e) => {
            const newColor = e.target.dataset.color;
            boardHeader.style.backgroundColor = newColor;
            board.color = newColor;
            saveData();
        });
    });
    
    return boardElement;
}

function createTaskElement(task) {
    const taskElement = document.createElement('div');
    taskElement.className = 'task';
    taskElement.dataset.taskId = task.id;
    
    const dragHandle = document.createElement('div');
    dragHandle.className = 'task-drag-handle';
    dragHandle.innerHTML = '⠿';
    
    const taskContent = document.createElement('textarea');
    taskContent.className = 'task-content';
    taskContent.value = task.content || '';
    taskContent.rows = 1;
    taskContent.spellcheck = false;
    
    const deleteBtn = document.createElement('div');
    deleteBtn.className = 'task-delete';
    deleteBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <path d="M4 7l16 0" />
            <path d="M10 11l0 6" />
            <path d="M14 11l0 6" />
            <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
            <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
        </svg>
    `;
    
    taskElement.appendChild(dragHandle);
    taskElement.appendChild(taskContent);
    taskElement.appendChild(deleteBtn);
    
    setTimeout(() => autoResizeTextarea(taskContent), 0);
    
    taskContent.addEventListener('input', () => {
        autoResizeTextarea(taskContent);
    });
    
    taskContent.addEventListener('change', () => {
        updateTaskContent(task.id, taskContent.value);
    });
    
    taskContent.addEventListener('blur', () => {
        updateTaskContent(task.id, taskContent.value);
    });
    
    taskContent.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            taskContent.blur();
        }
    });
    
    deleteBtn.addEventListener('click', () => {
        deleteTask(task.id);
    });
    
    return taskElement;
}

function initProjectsSortable() {
    new Sortable(projectsList, {
        handle: '.project-drag-handle',
        animation: 150,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        dragClass: 'sortable-drag',
        filter: '.project-menu-icon',
        preventOnFilter: false,
        onStart: function() {
            document.body.style.cursor = 'grabbing';
            document.querySelectorAll('.project-menu').forEach(menu => {
                menu.classList.remove('active');
            });
        },
        onEnd: function() {
            document.body.style.cursor = '';
            const projectsArray = Array.from(projectsList.children);
            const newOrder = projectsArray.map(el => el.dataset.projectId);
            
            kanbanData.projects.sort((a, b) => {
                return newOrder.indexOf(a.id) - newOrder.indexOf(b.id);
            });
            
            saveData();
        }
    });
}

function initSortable(container) {
    new Sortable(container, {
        group: 'shared',
        animation: 150,
        handle: '.task-drag-handle',
        ghostClass: 'sortable-ghost',
        onEnd: function(evt) {
            const taskId = evt.item.dataset.taskId;
            const newBoardId = evt.to.dataset.boardId;
            const newIndex = evt.newIndex;
            
            moveTask(taskId, newBoardId, newIndex);
        }
    });
}

function addProject(name) {
    const newProject = {
        id: generateId(),
        name: name,
        boards: []
    };
    kanbanData.projects.push(newProject);
    saveData();
    const projectElement = createProjectElement(newProject);
    projectsList.appendChild(projectElement);
    selectProject(newProject.id);
}

function editProject(projectId, newName) {
    const project = kanbanData.projects.find(p => p.id === projectId);
    if (project) {
        project.name = newName;
        saveData();
        
        const projectElement = document.querySelector(`.project-item[data-project-id="${projectId}"]`);
        if (projectElement) {
            projectElement.querySelector('.project-name').textContent = newName;
        }
        
        if (projectId === kanbanData.currentProjectId) {
            currentProjectTitle.textContent = newName;
        }
    }
}

function deleteProject(projectId) {
    kanbanData.projects = kanbanData.projects.filter(p => p.id !== projectId);
    saveData();
    if (projectId === kanbanData.currentProjectId) {
        kanbanData.currentProjectId = null;
        showWelcomeMessage();
    }
    renderProjects();
}

function addBoard(name) {
    if (!kanbanData.currentProjectId) return;
    const project = kanbanData.projects.find(p => p.id === kanbanData.currentProjectId);
    if (!project) return;
    const newBoard = {
    id: generateId(),
    name: name,
    tasks: [],
    color: "#d5dae1"
    };
    project.boards.push(newBoard);
    saveData();
    const boardElement = createBoardElement(newBoard);
    kanbanContainer.appendChild(boardElement);
    updateProgressBar(project.id);
    initSortable(boardElement.querySelector('.tasks-container'));
}

function editBoard(boardId, newName) {
    if (!kanbanData.currentProjectId) return;
    const project = kanbanData.projects.find(p => p.id === kanbanData.currentProjectId);
    if (!project) return;
    const board = project.boards.find(b => b.id === boardId);
    if (board) {
        board.name = newName;
        saveData();
        const boardElement = document.getElementById(`board-${boardId}`);
        boardElement.querySelector('.board-title').textContent = newName;
    }
}

function deleteBoard(boardId) {
    if (!kanbanData.currentProjectId) return;
    const project = kanbanData.projects.find(p => p.id === kanbanData.currentProjectId);
    if (!project) return;
    project.boards = project.boards.filter(b => b.id !== boardId);
    saveData();
    const boardElement = document.getElementById(`board-${boardId}`);
    boardElement.remove();
    updateProgressBar(project.id);
}

function addTaskToBoard(boardId, content) {
    if (!kanbanData.currentProjectId) return;
    const project = kanbanData.projects.find(p => p.id === kanbanData.currentProjectId);
    if (!project) return;
    const board = project.boards.find(b => b.id === boardId);
    if (board) {
        const newTask = {
            id: generateId(),
            content: content
        };
        board.tasks.push(newTask);
        saveData();
        const tasksContainer = document.querySelector(`.tasks-container[data-board-id="${boardId}"]`);
        const taskElement = createTaskElement(newTask);
        tasksContainer.appendChild(taskElement);
        updateProgressBar(project.id);
    }
}

function updateTaskContent(taskId, newContent) {
    if (!kanbanData.currentProjectId) return;
    
    const project = kanbanData.projects.find(p => p.id === kanbanData.currentProjectId);
    if (!project) return;
    
    for (const board of project.boards) {
        const task = board.tasks.find(t => t.id === taskId);
        if (task) {
            task.content = newContent;
            saveData();
            break;
        }
    }
}

function deleteTask(taskId) {
    if (!kanbanData.currentProjectId) return;
    const project = kanbanData.projects.find(p => p.id === kanbanData.currentProjectId);
    if (!project) return;
    for (const board of project.boards) {
        const taskIndex = board.tasks.findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
            board.tasks.splice(taskIndex, 1);
            saveData();
            const taskElement = document.querySelector(`.task[data-task-id="${taskId}"]`);
            taskElement.remove();
            updateProgressBar(project.id);
            break;
        }
    }
}

function moveTask(taskId, newBoardId, newIndex) {
    if (!kanbanData.currentProjectId) return;
    const project = kanbanData.projects.find(p => p.id === kanbanData.currentProjectId);
    if (!project) return;
    let taskToMove = null;
    let oldBoardIndex = -1;
    let oldTaskIndex = -1;
    for (let i = 0; i < project.boards.length; i++) {
        const taskIndex = project.boards[i].tasks.findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
            taskToMove = project.boards[i].tasks[taskIndex];
            oldBoardIndex = i;
            oldTaskIndex = taskIndex;
            break;
        }
    }
    if (taskToMove && oldBoardIndex !== -1) {
        project.boards[oldBoardIndex].tasks.splice(oldTaskIndex, 1);
        const newBoardIndex = project.boards.findIndex(b => b.id === newBoardId);
        if (newBoardIndex !== -1) {
            project.boards[newBoardIndex].tasks.splice(newIndex, 0, taskToMove);
            saveData();
            updateProgressBar(project.id);
        }
    }
}

function openProjectModal() {
    projectNameInput.value = '';
    projectModal.classList.add('active');
    projectNameInput.focus();
}

function closeProjectModal() {
    projectModal.classList.remove('active');
}

function openEditProjectModal(project) {
    projectEditInput.value = project.name;
    projectEditModal.dataset.projectId = project.id;
    projectEditModal.classList.add('active');
    projectEditInput.focus();
}

function closeEditProjectModal() {
    projectEditModal.classList.remove('active');
    delete projectEditModal.dataset.projectId;
}

function openDeleteProjectModal(project) {
    projectDeleteModal.dataset.projectId = project.id;
    projectDeleteModal.classList.add('active');
}

function closeDeleteProjectModal() {
    projectDeleteModal.classList.remove('active');
    delete projectDeleteModal.dataset.projectId;
}

function openBoardModal() {
    if (!kanbanData.currentProjectId) return;
    boardNameInput.value = '';
    boardModal.classList.add('active');
    boardNameInput.focus();
}

function closeBoardModal() {
    boardModal.classList.remove('active');
}

function openEditBoardModal(board) {
    currentBoardId = board.id;
    boardEditInput.value = board.name;
    boardEditModal.classList.add('active');
    boardEditInput.focus();
}

function closeEditBoardModal() {
    boardEditModal.classList.remove('active');
    currentBoardId = null;
}

function openDeleteBoardModal(board) {
    currentBoardId = board.id;
    boardDeleteModal.classList.add('active');
}

function closeDeleteBoardModal() {
    boardDeleteModal.classList.remove('active');
    currentBoardId = null;
}

newProjectBtn.addEventListener('click', openProjectModal);

cancelProjectBtn.addEventListener('click', (e) => {
    e.preventDefault();
    closeProjectModal();
});

createProjectBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const projectName = projectNameInput.value.trim();
    if (projectName) {
        addProject(projectName);
        closeProjectModal();
    }
});

cancelProjectEditBtn.addEventListener('click', (e) => {
    e.preventDefault();
    closeEditProjectModal();
});

confirmProjectEditBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const newName = projectEditInput.value.trim();
    const projectId = projectEditModal.dataset.projectId;
    if (newName && projectId) {
        editProject(projectId, newName);
        closeEditProjectModal();
    }
});

cancelProjectDeleteBtn.addEventListener('click', (e) => {
    e.preventDefault();
    closeDeleteProjectModal();
});

confirmProjectDeleteBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const projectId = projectDeleteModal.dataset.projectId;
    if (projectId) {
        deleteProject(projectId);
        closeDeleteProjectModal();
    }
});

newBoardBtn.addEventListener('click', () => {
    if (!kanbanData.currentProjectId) {
        showWelcomeMessage();
        return;
    }
    openBoardModal();
});

cancelBoardBtn.addEventListener('click', (e) => {
    e.preventDefault();
    closeBoardModal();
});

createBoardBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const boardName = boardNameInput.value.trim();
    if (boardName && kanbanData.currentProjectId) {
        addBoard(boardName);
        closeBoardModal();
    }
});

cancelEditBtn.addEventListener('click', (e) => {
    e.preventDefault();
    closeEditBoardModal();
});

confirmEditBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const newName = boardEditInput.value.trim();
    if (newName && currentBoardId) {
        editBoard(currentBoardId, newName);
        closeEditBoardModal();
    }
});

cancelDeleteBtn.addEventListener('click', (e) => {
    e.preventDefault();
    closeDeleteBoardModal();
});

confirmDeleteBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (currentBoardId) {
        deleteBoard(currentBoardId);
        closeDeleteBoardModal();
    }
});

projectNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        createProjectBtn.click();
    }
});

projectEditInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        confirmProjectEditBtn.click();
    }
});

boardNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        createBoardBtn.click();
    }
});

boardEditInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        confirmEditBtn.click();
    }
});

function createCookieConsent() {
    if (localStorage.getItem('cookieConsentKanbban')) {
        return;
    }
    const cookieConsent = document.createElement('div');
    cookieConsent.className = 'cookie-consent';
    cookieConsent.innerHTML = `
        <div class="cookie-header"><strong>Cookie warning</strong></div>
        <p style="font-size: 13px; color: #555;">We use cookies to improve your experience. By continuing, you agree to our <a href="about" target="_blank">Cookie policy</a>.</p>
        <button id="accept-cookies-btn">OK, accept.</button>
    `;
    document.body.appendChild(cookieConsent);
    document.getElementById('accept-cookies-btn').addEventListener('click', acceptCookies);
}

function acceptCookies() {
    localStorage.setItem('cookieConsentKanbban', 'true');
    const cookieConsent = document.querySelector('.cookie-consent');
    if (cookieConsent) {
        cookieConsent.remove();
    }
}

function triggerConfetti() {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { x:0.3, y: 0.2 },
      zIndex: 99999999999999
    });
}

document.addEventListener('DOMContentLoaded', () => {
    fetchApiKey();
    createCookieConsent();
    loadingMessage.style.display = "none";
    gapiLoaded();
    gisLoaded();
    loadData();
});
