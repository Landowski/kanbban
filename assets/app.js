const CLIENT_ID = '1096932758704-s3bk9oo6pcgi03muahuk1u4ejrh2lab6.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file profile email';
const FOLDER_NAME = 'Kanbban';
const JSON_FILENAME = 'Kanbban.json';
let API_KEY = '';
let tokenClient;
let gapiInited = false;
let gisInited = false;
let jsonFileId = null;
let kanbbanFolderId = null;
let debounceTimer;
const wall = document.getElementById('wall');
const userNameSpan = document.getElementById('name');
const userAvatar = document.getElementById('user-avatar');
const logoutButton = document.getElementById('logout');
const loadingMessage = document.getElementById("loading-message");

let kanbanData = {
    projects: [],
    currentProjectId: null,
    currentBoardId: null
};

const newProjectBtn = document.getElementById('new-project-btn');
const projectModal = document.getElementById('project-modal');
const projectNameInput = document.getElementById('project-name-input');
const createProjectBtn = document.getElementById('create-project-btn');
const cancelProjectBtn = document.getElementById('cancel-project-btn');

async function initializeApp() {
    fetchApiKey();
    gapiLoaded();
    gisLoaded();
}

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
        maybeEnableAuth();
    } catch (error) {
        console.error('Error initializing gapi.client:', error);
    }
}

function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '',
    });
    gisInited = true;
    maybeEnableAuth();
}

function maybeEnableAuth() {
    if (gapiInited && gisInited) {
        checkLoginStatus();
    }
}

async function checkLoginStatus() {
    const savedToken = localStorage.getItem('gapi_token_kanbban');
    const savedUser = localStorage.getItem('googleUser_kanbban');

    if (savedToken && savedUser) {
        try {
            const token = JSON.parse(savedToken);
            gapi.client.setToken(token);
            
            await gapi.client.drive.files.list({
                q: "mimeType='application/vnd.google-apps.folder'",
                pageSize: 1,
                fields: 'files(id, name)'
            });
            
            const userInfo = JSON.parse(savedUser);
            onSuccessfulAuth(userInfo);
        } catch (error) {
            console.warn('Token expired, trying to refresh...');
            try {
                await renewToken();
                const userInfo = JSON.parse(savedUser);
                onSuccessfulAuth(userInfo);
            } catch (renewError) {
                console.error('Error refreshing token:', renewError);
                handleSignOut();
            }
        }
    } else {
        showLoginView();
    }
}

function onSuccessfulAuth(userInfo) {
    userNameSpan.textContent = userInfo.name || 'User';
    
    if (userInfo.picture) {
        userAvatar.src = userInfo.picture;
        userAvatar.style.display = 'block';
    } else {
        const initials = userInfo.name ? userInfo.name.split(' ').map(n => n[0]).join('') : 'U';
        userAvatar.src = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%23666'/><text x='50' y='60' font-size='50' text-anchor='middle' fill='white'>${initials}</text></svg>`;
    }
    
    if (wall) wall.remove();
    
    setInterval(() => {
        renewToken().catch(err => {
            console.error("Error refreshing token automatically:", err);
        });
    }, 50 * 60 * 1000);
    
    findOrCreateJsonFile().then(() => {
        loadingMessage.style.display = "none";
        setupEventListeners();
        renderProjects();
        showWelcomeMessage();
    });
}

function renewToken() {
    return new Promise((resolve, reject) => {
        tokenClient.callback = (resp) => {
            if (resp.error) {
                console.error("Error refreshing token:", resp.error);
                if (resp.error === 'popup_blocked_by_browser') {
                    alert("⚠️ Please allow popups to continue using the app.");
                }
                reject(resp.error);
                return;
            }
            const newToken = gapi.client.getToken();
            localStorage.setItem('gapi_token_kanbban', JSON.stringify(newToken));
            resolve(newToken);
        };
        tokenClient.requestAccessToken({ prompt: '' });
    });
}

function showLoginView() {
    window.location.href = '/';
}

function handleSignOut() {
    try {
        const token = gapi.client?.getToken?.();
        if (token) {
            google.accounts.oauth2.revoke(token.access_token);
            gapi.client.setToken('');
        }
    } catch (e) {
        console.log('Error during signout:', e);
    }
    localStorage.removeItem('gapi_token_kanbban');
    localStorage.removeItem('googleUser_kanbban');
    showLoginView();
}

let folderCreationInProgress = false;
let jsonCreationInProgress = false;

async function ensureKanbbanFolderExists() {
    if (kanbbanFolderId) return kanbbanFolderId;
    if (folderCreationInProgress) {
        await new Promise(resolve => {
            const check = setInterval(() => {
                if (!folderCreationInProgress) {
                    clearInterval(check);
                    resolve();
                }
            }, 100);
        });
        return kanbbanFolderId;
    }

    folderCreationInProgress = true;
    
    try {
        const response = await gapi.client.drive.files.list({
            q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents`,
            fields: 'files(id, name, createdTime)',
            spaces: 'drive',
            orderBy: 'createdTime desc',
            pageSize: 1
        });

        if (response.result.files && response.result.files.length > 0) {
            kanbbanFolderId = response.result.files[0].id;
            return kanbbanFolderId;
        }

        const createResponse = await gapi.client.drive.files.create({
            resource: {
                name: FOLDER_NAME,
                mimeType: 'application/vnd.google-apps.folder',
                parents: ['root']
            },
            fields: 'id'
        });

        kanbbanFolderId = createResponse.result.id;
        return kanbbanFolderId;
    } catch (error) {
        console.error('Error checking/creating Kanbban folder:', error);
        throw error;
    } finally {
        folderCreationInProgress = false;
    }
}

async function findOrCreateJsonFile() {
    if (jsonFileId) return;
    if (jsonCreationInProgress) {
        await new Promise(resolve => {
            const check = setInterval(() => {
                if (!jsonCreationInProgress) {
                    clearInterval(check);
                    resolve();
                }
            }, 100);
        });
        return;
    }
    
    jsonCreationInProgress = true;
    loadingMessage.style.display = "flex";
    
    try {
        await ensureKanbbanFolderExists();

        const response = await gapi.client.drive.files.list({
            q: `name='${JSON_FILENAME}' and '${kanbbanFolderId}' in parents and trashed=false`,
            fields: 'files(id, name, createdTime)',
            spaces: 'drive',
            orderBy: 'createdTime desc',
            pageSize: 1
        });

        if (response.result.files && response.result.files.length > 0) {
            jsonFileId = response.result.files[0].id;
            await loadKanbanDataFromDrive();
            return;
        }
        
        await createNewJsonFile();
    } catch (error) {
        console.error('Error in findOrCreateJsonFile:', error);
        await recoverFromInconsistentState();
    } finally {
        jsonCreationInProgress = false;
    }
}

async function recoverFromInconsistentState() {
    try {
        kanbbanFolderId = null;
        jsonFileId = null;
        
        const foldersResponse = await gapi.client.drive.files.list({
            q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name, createdTime)',
            orderBy: 'createdTime desc'
        });
        
        if (foldersResponse.result.files && foldersResponse.result.files.length > 0) {
            kanbbanFolderId = foldersResponse.result.files[0].id;
            
            const jsonResponse = await gapi.client.drive.files.list({
                q: `name='${JSON_FILENAME}' and '${kanbbanFolderId}' in parents and trashed=false`,
                fields: 'files(id, name, createdTime)',
                orderBy: 'createdTime desc'
            });
            
            if (jsonResponse.result.files && jsonResponse.result.files.length > 0) {
                jsonFileId = jsonResponse.result.files[0].id;
                await loadKanbanDataFromDrive();
                return;
            }
        }
        
        await ensureKanbbanFolderExists();
        await createNewJsonFile();
    } catch (error) {
        console.error('Error in recoverFromInconsistentState:', error);
        throw error;
    }
}

async function createNewJsonFile() {
    const fileMetadata = {
        name: JSON_FILENAME,
        mimeType: 'application/json',
        parents: [kanbbanFolderId]
    };
    
    const initialData = {
        projects: [],
        currentProjectId: null,
        currentBoardId: null
    };
    
    const fileContent = JSON.stringify(initialData, null, 2);
    
    const response = await gapi.client.request({
        path: 'https://www.googleapis.com/upload/drive/v3/files',
        method: 'POST',
        params: { uploadType: 'multipart' },
        headers: { 'Content-Type': 'multipart/related; boundary=boundary' },
        body: [
            '--boundary',
            'Content-Type: application/json; charset=UTF-8',
            '',
            JSON.stringify(fileMetadata),
            '--boundary',
            'Content-Type: application/json',
            '',
            fileContent,
            '--boundary--'
        ].join('\r\n')
    });
    
    jsonFileId = response.result.id;
    kanbanData = initialData;
}

async function loadKanbanDataFromDrive() {
    try {
        const response = await gapi.client.drive.files.get({
            fileId: jsonFileId,
            alt: 'media'
        });
        
        kanbanData = response.result;

        if (!kanbanData.projects) kanbanData.projects = [];

        kanbanData.currentProjectId = null;
        if (!kanbanData.currentBoardId) kanbanData.currentBoardId = null;
        

        kanbanData.projects.forEach(project => {
            if (!project.boards) project.boards = [];
            project.boards.forEach(board => {
                if (!board.tasks) board.tasks = [];
                if (!board.color) board.color = "#d5dae1";
            });
        });
        
    } catch (error) {
        console.error('Error loading Kanban data:', error);
        throw error;
    }
}

async function saveKanbanDataToDrive() {
    if (!jsonFileId) return;
    
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
        try {
            const fileContent = JSON.stringify(kanbanData, null, 2);
            await gapi.client.request({
                path: `https://www.googleapis.com/upload/drive/v3/files/${jsonFileId}`,
                method: 'PATCH',
                params: { uploadType: 'media' },
                body: fileContent
            });
        } catch (error) {
            console.error('Error saving Kanban data:', error);
        }
    }, 500);
}

function addProject(name) {
    const newProject = {
        id: generateId(),
        name: name,
        boards: []
    };
    
    kanbanData.projects.push(newProject);
    saveKanbanDataToDrive();
    
    const projectElement = createProjectElement(newProject);
    document.getElementById('projects-list').appendChild(projectElement);
    selectProject(newProject.id);
}

function editProject(projectId, newName) {
    const project = kanbanData.projects.find(p => p.id === projectId);
    if (project) {
        project.name = newName;
        saveKanbanDataToDrive();
        
        const projectElement = document.querySelector(`.project-item[data-project-id="${projectId}"]`);
        if (projectElement) {
            projectElement.querySelector('.project-name').textContent = newName;
        }
        
        if (projectId === kanbanData.currentProjectId) {
            document.getElementById('current-project-title').textContent = newName;
        }
    }
}

function deleteProject(projectId) {
    kanbanData.projects = kanbanData.projects.filter(p => p.id !== projectId);
    
    if (projectId === kanbanData.currentProjectId) {
        kanbanData.currentProjectId = null;
        showWelcomeMessage();
    }
    
    saveKanbanDataToDrive();
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
    saveKanbanDataToDrive();
    
    const boardElement = createBoardElement(newBoard);
    document.getElementById('kanban-container').appendChild(boardElement);
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
        saveKanbanDataToDrive();
        
        const boardElement = document.getElementById(`board-${boardId}`);
        if (boardElement) {
            boardElement.querySelector('.board-title').textContent = newName;
        }
    }
}

function deleteBoard(boardId) {
    if (!kanbanData.currentProjectId) return;
    
    const project = kanbanData.projects.find(p => p.id === kanbanData.currentProjectId);
    if (!project) return;
    
    project.boards = project.boards.filter(b => b.id !== boardId);
    saveKanbanDataToDrive();
    
    const boardElement = document.getElementById(`board-${boardId}`);
    if (boardElement) {
        boardElement.remove();
    }
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
        saveKanbanDataToDrive();
        
        const tasksContainer = document.querySelector(`.tasks-container[data-board-id="${boardId}"]`);
        if (tasksContainer) {
            const taskElement = createTaskElement(newTask);
            tasksContainer.appendChild(taskElement);
            updateProgressBar(project.id);
        }
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
            saveKanbanDataToDrive();
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
            saveKanbanDataToDrive();
            
            const taskElement = document.querySelector(`.task[data-task-id="${taskId}"]`);
            if (taskElement) {
                taskElement.remove();
            }
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
            saveKanbanDataToDrive();
            updateProgressBar(project.id);
        }
    }
}

function renderProjects() {
    const projectsList = document.getElementById('projects-list');
    if (!projectsList) return;
    
    projectsList.innerHTML = '';
    
    kanbanData.projects.forEach(project => {
        const projectElement = createProjectElement(project);
        projectsList.appendChild(projectElement);
    });
    
    initProjectsSortable();
}

function createProjectElement(project) {
    const projectElement = document.createElement('div');
    projectElement.className = `project-item ${project.id === kanbanData.currentProjectId ? 'active' : ''}`;
    projectElement.dataset.projectId = project.id;
    
    projectElement.innerHTML = `
        <div class="project-handle-name-group">
            <div class="project-drag-handle" aria-label="Drag to reorder">⠿</div>
            <div class="project-name">${project.name}</div>
        </div>
        <div class="project-menu-icon">
            <div class="menu-dots">
                <div class="menu-dot"></div>
                <div class="menu-dot"></div>
                <div class="menu-dot"></div>
            </div>
            <div class="project-menu">
                <div class="menu-item menu-edit"><svg  xmlns="http://www.w3.org/2000/svg"  width="20"  height="20"  viewBox="0 0 24 24"  fill="currentColor" style="margin-top: -3px;"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M17.828 2a3 3 0 0 1 1.977 .743l.145 .136l1.171 1.17a3 3 0 0 1 .136 4.1l-.136 .144l-1.706 1.707l2.292 2.293a1 1 0 0 1 .083 1.32l-.083 .094l-4 4a1 1 0 0 1 -1.497 -1.32l.083 -.094l3.292 -3.293l-1.586 -1.585l-7.464 7.464a3.828 3.828 0 0 1 -2.474 1.114l-.233 .008c-.674 0 -1.33 -.178 -1.905 -.508l-1.216 1.214a1 1 0 0 1 -1.497 -1.32l.083 -.094l1.214 -1.216a3.828 3.828 0 0 1 .454 -4.442l.16 -.17l10.586 -10.586a3 3 0 0 1 1.923 -.873l.198 -.006zm0 2a1 1 0 0 0 -.608 .206l-.099 .087l-1.707 1.707l2.586 2.585l1.707 -1.706a1 1 0 0 0 .284 -.576l.01 -.131a1 1 0 0 0 -.207 -.609l-.087 -.099l-1.171 -1.171a1 1 0 0 0 -.708 -.293z" /></svg>Edit</div>
                <div class="menu-item menu-delete"><svg  xmlns="http://www.w3.org/2000/svg"  width="20"  height="20"  viewBox="0 0 24 24"  fill="currentColor" style="margin-top: -3px;"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 6a1 1 0 0 1 .117 1.993l-.117 .007h-.081l-.919 11a3 3 0 0 1 -2.824 2.995l-.176 .005h-8c-1.598 0 -2.904 -1.249 -2.992 -2.75l-.005 -.167l-.923 -11.083h-.08a1 1 0 0 1 -.117 -1.993l.117 -.007h16z" /><path d="M14 2a2 2 0 0 1 2 2a1 1 0 0 1 -1.993 .117l-.007 -.117h-4l-.007 .117a1 1 0 0 1 -1.993 -.117a2 2 0 0 1 1.85 -1.995l.15 -.005h4z" /></svg>Delete</div>
            </div>
        </div>
    `;
    
    projectElement.addEventListener('click', (e) => {
        if (!e.target.closest('.project-menu-icon') && !e.target.closest('.project-drag-handle')) {
            selectProject(project.id);
        }
    });
    
    const menuIcon = projectElement.querySelector('.project-menu-icon');
    menuIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        projectElement.querySelector('.project-menu').classList.toggle('active');
    });
    
    projectElement.querySelector('.menu-edit').addEventListener('click', () => {
        openEditProjectModal(project);
    });
    
    projectElement.querySelector('.menu-delete').addEventListener('click', () => {
        openDeleteProjectModal(project);
    });
    
    return projectElement;
}

function selectProject(projectId) {
    if (kanbanData.currentProjectId === projectId) return;
    
    document.querySelectorAll('.project-item').forEach(item => {
        item.classList.remove('active');
    });
    
    kanbanData.currentProjectId = projectId;
    saveKanbanDataToDrive();
    
    const selectedProject = document.querySelector(`.project-item[data-project-id="${projectId}"]`);
    if (selectedProject) {
        selectedProject.classList.add('active');
    }
    showProjectContent(projectId);
}

function showProjectContent(projectId) {
    document.getElementById('welcome-message').style.display = 'none';
    document.getElementById('kanban-container').classList.add('active');
    document.getElementById('new-board-btn').style.display = 'flex';
    
    const project = kanbanData.projects.find(p => p.id === projectId);
    if (project) {
        document.getElementById('current-project-title').textContent = project.name;
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
        updateProgressBar(projectId);
        renderBoards();
    }
}

function renderBoards() {
    const kanbanContainer = document.getElementById('kanban-container');
    if (!kanbanContainer) return;
    
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
    boardHeader.style.backgroundColor = board.color || '#d5dae1';

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
        <div class="menu-item menu-edit"><svg  xmlns="http://www.w3.org/2000/svg"  width="20"  height="20"  viewBox="0 0 24 24"  fill="currentColor" style="margin-top: -3px;"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M17.828 2a3 3 0 0 1 1.977 .743l.145 .136l1.171 1.17a3 3 0 0 1 .136 4.1l-.136 .144l-1.706 1.707l2.292 2.293a1 1 0 0 1 .083 1.32l-.083 .094l-4 4a1 1 0 0 1 -1.497 -1.32l.083 -.094l3.292 -3.293l-1.586 -1.585l-7.464 7.464a3.828 3.828 0 0 1 -2.474 1.114l-.233 .008c-.674 0 -1.33 -.178 -1.905 -.508l-1.216 1.214a1 1 0 0 1 -1.497 -1.32l.083 -.094l1.214 -1.216a3.828 3.828 0 0 1 .454 -4.442l.16 -.17l10.586 -10.586a3 3 0 0 1 1.923 -.873l.198 -.006zm0 2a1 1 0 0 0 -.608 .206l-.099 .087l-1.707 1.707l2.586 2.585l1.707 -1.706a1 1 0 0 0 .284 -.576l.01 -.131a1 1 0 0 0 -.207 -.609l-.087 -.099l-1.171 -1.171a1 1 0 0 0 -.708 -.293z" /></svg>Edit</div>
        <div class="menu-item menu-delete"><svg  xmlns="http://www.w3.org/2000/svg"  width="20"  height="20"  viewBox="0 0 24 24"  fill="currentColor" style="margin-top: -3px;"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 6a1 1 0 0 1 .117 1.993l-.117 .007h-.081l-.919 11a3 3 0 0 1 -2.824 2.995l-.176 .005h-8c-1.598 0 -2.904 -1.249 -2.992 -2.75l-.005 -.167l-.923 -11.083h-.08a1 1 0 0 1 -.117 -1.993l.117 -.007h16z" /><path d="M14 2a2 2 0 0 1 2 2a1 1 0 0 1 -1.993 .117l-.007 -.117h-4l-.007 .117a1 1 0 0 1 -1.993 -.117a2 2 0 0 1 1.85 -1.995l.15 -.005h4z" /></svg>Delete</div>
    `;

    menuIcon.appendChild(boardMenu);
    boardHeader.appendChild(boardTitle);
    boardHeader.appendChild(menuIcon);

    document.addEventListener('click', () => {
        boardMenu.classList.remove('active');
    });

    boardMenu.querySelectorAll('.color-choice').forEach(choice => {
    choice.addEventListener('click', () => {
        const newColor = choice.dataset.color;
        boardHeader.style.backgroundColor = newColor;

        const project = kanbanData.projects.find(p => p.id === kanbanData.currentProjectId);
        if (!project) return;

        const boardToUpdate = project.boards.find(b => b.id === board.id);
        if (!boardToUpdate) return;

        boardToUpdate.color = newColor;
        saveKanbanDataToDrive();
    });
    });

    const taskForm = document.createElement('form');
    taskForm.className = 'task-form';
    taskForm.innerHTML = `<input type="text" class="task-input" placeholder="Add task">`;

    taskForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = taskForm.querySelector('.task-input');
        const taskContent = input.value.trim();
        if (taskContent) {
            addTaskToBoard(board.id, taskContent);
            input.value = '';
        }
    });

    const tasksContainer = document.createElement('div');
    tasksContainer.className = 'tasks-container';
    tasksContainer.dataset.boardId = board.id;

    board.tasks.forEach(task => {
        const taskElement = createTaskElement(task);
        tasksContainer.appendChild(taskElement);
    });

    menuIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        boardMenu.classList.toggle('active');
    });

    boardMenu.querySelector('.menu-edit').addEventListener('click', () => {
        openEditBoardModal(board);
    });

    boardMenu.querySelector('.menu-delete').addEventListener('click', () => {
        openDeleteBoardModal(board);
    });

    boardElement.appendChild(boardHeader);
    boardElement.appendChild(taskForm);
    boardElement.appendChild(tasksContainer);

    return boardElement;
};

function createTaskElement(task) {
    const taskElement = document.createElement('div');
    taskElement.className = 'task';
    taskElement.dataset.taskId = task.id;

    const dragHandle = document.createElement('div');
    dragHandle.className = 'task-drag-handle';
    dragHandle.innerHTML = '⠿';

    const textarea = document.createElement('textarea');
    textarea.className = 'task-content';
    textarea.value = task.content || '';
    textarea.rows = 1;
    textarea.spellcheck = false;

    const deleteBtn = document.createElement('div');
    deleteBtn.className = 'task-delete';
    deleteBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <path d="M4 7l16 0"/>
            <path d="M10 11l0 6"/>
            <path d="M14 11l0 6"/>
            <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"/>
            <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"/>
        </svg>
    `;

    setTimeout(() => autoResizeTextarea(textarea), 0);

    textarea.addEventListener('input', () => {
        autoResizeTextarea(textarea);
    });

    textarea.addEventListener('change', () => {
        updateTaskContent(task.id, textarea.value);
    });

    textarea.addEventListener('blur', () => {
        updateTaskContent(task.id, textarea.value);
    });

    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            textarea.blur();
        }
    });

    deleteBtn.addEventListener('click', () => {
        deleteTask(task.id);
    });

    taskElement.appendChild(dragHandle);
    taskElement.appendChild(textarea);
    taskElement.appendChild(deleteBtn);

    return taskElement;
}

function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}


function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
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
    document.getElementById('project-edit-input').value = project.name;
    document.getElementById('project-edit-modal').dataset.projectId = project.id;
    document.getElementById('project-edit-modal').classList.add('active');
    document.getElementById('project-edit-input').focus();
}

function closeEditProjectModal() {
    document.getElementById('project-edit-modal').classList.remove('active');
    delete document.getElementById('project-edit-modal').dataset.projectId;
}

function openDeleteProjectModal(project) {
    document.getElementById('project-delete-modal').dataset.projectId = project.id;
    document.getElementById('project-delete-modal').classList.add('active');
}

function closeDeleteProjectModal() {
    document.getElementById('project-delete-modal').classList.remove('active');
    delete document.getElementById('project-delete-modal').dataset.projectId;
}

function openBoardModal() {
    if (!kanbanData.currentProjectId) return;
    
    document.getElementById('board-name-input').value = '';
    document.getElementById('board-modal').classList.add('active');
    document.getElementById('board-name-input').focus();
}

function closeBoardModal() {
    document.getElementById('board-modal').classList.remove('active');
}

function openEditBoardModal(board) {
    document.getElementById('board-edit-input').value = board.name;
    document.getElementById('board-edit-modal').dataset.boardId = board.id;
    document.getElementById('board-edit-modal').classList.add('active');
    document.getElementById('board-edit-input').focus();
}

function closeEditBoardModal() {
    document.getElementById('board-edit-modal').classList.remove('active');
    delete document.getElementById('board-edit-modal').dataset.boardId;
}

function openDeleteBoardModal(board) {
    document.getElementById('board-delete-modal').dataset.boardId = board.id;
    document.getElementById('board-delete-modal').classList.add('active');
}

function closeDeleteBoardModal() {
    document.getElementById('board-delete-modal').classList.remove('active');
    delete document.getElementById('board-delete-modal').dataset.boardId;
}

function initProjectsSortable() {
    const projectsList = document.getElementById('projects-list');
    if (!projectsList) return;
    
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
            
            saveKanbanDataToDrive();
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

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function showWelcomeMessage() {
    document.getElementById('welcome-message').style.display = 'block';
    document.getElementById('kanban-container').classList.remove('active');
    document.getElementById('current-project-title').textContent = 'Quick notepad';
    document.getElementById('new-board-btn').style.display = 'none';
    
    document.querySelectorAll('.project-item').forEach(item => {
        item.classList.remove('active');
    });
    
    kanbanData.currentProjectId = null;
    saveKanbanDataToDrive();

    const existingProgressBar = document.querySelector('.progress-container');
    if (existingProgressBar) {
        existingProgressBar.remove();
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
}

function setupEventListeners() {
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
    
    document.getElementById('cancel-project-edit-btn').addEventListener('click', (e) => {
        e.preventDefault();
        closeEditProjectModal();
    });
    
    document.getElementById('confirm-project-edit-btn').addEventListener('click', (e) => {
        e.preventDefault();
        const newName = document.getElementById('project-edit-input').value.trim();
        const projectId = document.getElementById('project-edit-modal').dataset.projectId;
        if (newName && projectId) {
            editProject(projectId, newName);
            closeEditProjectModal();
        }
    });
    
    document.getElementById('cancel-project-delete-btn').addEventListener('click', (e) => {
        e.preventDefault();
        closeDeleteProjectModal();
    });
    
    document.getElementById('confirm-project-delete-btn').addEventListener('click', (e) => {
        e.preventDefault();
        const projectId = document.getElementById('project-delete-modal').dataset.projectId;
        if (projectId) {
            deleteProject(projectId);
            closeDeleteProjectModal();
        }
    });
    
    document.getElementById('new-board-btn').addEventListener('click', () => {
        if (!kanbanData.currentProjectId) {
            showWelcomeMessage();
            return;
        }
        openBoardModal();
    });
    
    document.getElementById('cancel-board-btn').addEventListener('click', (e) => {
        e.preventDefault();
        closeBoardModal();
    });
    
    document.getElementById('create-board-btn').addEventListener('click', (e) => {
        e.preventDefault();
        const boardName = document.getElementById('board-name-input').value.trim();
        if (boardName && kanbanData.currentProjectId) {
            addBoard(boardName);
            closeBoardModal();
        }
    });
    
    document.getElementById('cancel-edit-btn').addEventListener('click', (e) => {
        e.preventDefault();
        closeEditBoardModal();
    });
    
    document.getElementById('confirm-edit-btn').addEventListener('click', (e) => {
        e.preventDefault();
        const newName = document.getElementById('board-edit-input').value.trim();
        const boardId = document.getElementById('board-edit-modal').dataset.boardId;
        if (newName && boardId) {
            editBoard(boardId, newName);
            closeEditBoardModal();
        }
    });
    
    document.getElementById('cancel-delete-btn').addEventListener('click', (e) => {
        e.preventDefault();
        closeDeleteBoardModal();
    });
    
    document.getElementById('confirm-delete-btn').addEventListener('click', (e) => {
        e.preventDefault();
        const boardId = document.getElementById('board-delete-modal').dataset.boardId;
        if (boardId) {
            deleteBoard(boardId);
            closeDeleteBoardModal();
        }
    });
    
    document.getElementById('homeBtn').addEventListener('click', () => {
        if (kanbanData.currentProjectId) {
            const currentProjectElement = document.querySelector(`.project-item[data-project-id="${kanbanData.currentProjectId}"]`);
            if (currentProjectElement) {
                currentProjectElement.classList.remove('active');
            }
            showWelcomeMessage();
            kanbanData.currentProjectId = null;
            saveKanbanDataToDrive();
        }
    });
    
    
    
    projectNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            createProjectBtn.click();
        }
    });
    
    document.getElementById('project-edit-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('confirm-project-edit-btn').click();
        }
    });
    
    document.getElementById('board-name-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('create-board-btn').click();
        }
    });
    
    document.getElementById('board-edit-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('confirm-edit-btn').click();
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const checkAPIs = setInterval(() => {
        if (window.gapi && window.google) {
            clearInterval(checkAPIs);
            initializeApp();
        }
    }, 100);
});

logoutButton.addEventListener('click', handleSignOut);
