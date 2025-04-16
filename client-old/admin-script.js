// 관리자 대시보드 스크립트
document.addEventListener('DOMContentLoaded', () => {
    // --- Element Selectors ---
    const userSettingsForm = document.getElementById('userSettingsForm');
    const systemSettingsForm = document.getElementById('systemSettingsForm');
    const userMessageArea = document.getElementById('userMessageArea');
    const systemMessageArea = document.getElementById('systemMessageArea');
    const historyTableBody = document.getElementById('historyTableBody');
    const refreshHistoryButton = document.getElementById('refreshHistory');
    const scheduleFormElement = document.getElementById('scheduleFormElement');
    const scheduleFormContainer = document.getElementById('scheduleForm');
    const scheduleFormTitle = document.getElementById('scheduleFormTitle');
    const scheduleTableBody = document.getElementById('scheduleTableBody');
    const addScheduleBtn = document.getElementById('addScheduleBtn');
    const cancelScheduleEditBtn = document.getElementById('cancelScheduleEdit');
    const scheduleIdInput = document.getElementById('scheduleId');
    const postNowBtn = document.getElementById('postNowBtn');
    const refreshStatsBtn = document.getElementById('refreshStatsBtn');
    const tabLinks = document.querySelectorAll('.tab-link');
    const tabContents = document.querySelectorAll('.tab-content');
    const currentDateSpan = document.getElementById('currentDate');
    
    // Dashboard elements
    const todayPostCount = document.getElementById('todayPostCount');
    const dailyPostLimit = document.getElementById('dailyPostLimit');
    const todayImageCount = document.getElementById('todayImageCount');
    const serverStatus = document.getElementById('serverStatus');
    const uptime = document.getElementById('uptime');
    const nextScheduleTime = document.getElementById('nextScheduleTime');
    const nextScheduleUser = document.getElementById('nextScheduleUser');

    let currentSchedules = []; // Keep schedules in memory

    // --- Utility Functions ---
    function showMessage(message, type = 'info', areaId) {
        const area = document.getElementById(areaId);
        if (!area) {
            console.warn('Message area not found for ID:', areaId);
            return;
        }
        area.textContent = message;
        area.className = 'mt-4 text-center p-2 rounded '; // Reset class
        if (type === 'success') {
            area.classList.add('bg-green-100', 'text-green-700');
        } else if (type === 'error') {
            area.classList.add('bg-red-100', 'text-red-700');
        } else {
            area.classList.add('bg-blue-100', 'text-blue-700');
        }
        // Clear message after 5 seconds
        setTimeout(() => { 
            area.textContent = ''; 
            area.className = 'mt-4 text-center'; 
        }, 5000);
    }

    // --- Tab Management --- 
    function activateTab(targetId) {
        if (!targetId || !document.getElementById(targetId)) {
            console.warn('Invalid targetId for tab activation:', targetId);
            targetId = 'dashboardContent'; // Fallback to default
        }
        
        tabLinks.forEach(link => {
            const isActive = link.dataset.target === targetId;
            link.classList.toggle('active-tab', isActive);
            link.classList.toggle('border-indigo-500', isActive);
            link.classList.toggle('text-indigo-600', isActive);
            link.classList.toggle('border-transparent', !isActive);
            link.classList.toggle('text-gray-500', !isActive);
            link.classList.toggle('hover:text-gray-700', !isActive);
            link.classList.toggle('hover:border-gray-300', !isActive);
        });
        tabContents.forEach(content => {
            content.classList.toggle('hidden', content.id !== targetId);
        });
        
        // Update URL hash
        const newHash = '#' + targetId.replace('Content', '');
        if (window.location.hash !== newHash) {
            window.location.hash = newHash;
        }
        
        // Load data based on active tab
        if (targetId === 'historyContent') {
            loadHistory();
        } else if (targetId === 'scheduleContent') {
            loadSchedules();
        } else if (targetId === 'dashboardContent') {
            loadDashboardStats();
        } else if (targetId === 'userSettingsContent') {
            loadUserSettings();
        } else if (targetId === 'systemSettingsContent') {
            loadSystemSettings();
        }
    }

    tabLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = e.currentTarget.dataset.target;
            if (targetId) {
                activateTab(targetId);
            }
        });
    });

    // --- Dashboard Stats ---
    async function loadDashboardStats() {
        try {
            const response = await fetch('/api/admin/dashboard-stats');
            if (!response.ok) {
                throw new Error('대시보드 정보를 가져오는 중 오류가 발생했습니다.');
            }
            const stats = await response.json();
            
            // Update Dashboard UI
            if (todayPostCount) todayPostCount.textContent = stats.todayPostCount || '0';
            if (dailyPostLimit) dailyPostLimit.textContent = stats.dailyPostLimit || '5';
            if (todayImageCount) todayImageCount.textContent = stats.todayImageCount || '0';
            if (serverStatus) serverStatus.textContent = stats.serverStatus || '정상';
            if (uptime) uptime.textContent = stats.uptime || '0일 0시간';
            
            // Next schedule info
            if (stats.nextSchedule) {
                if (nextScheduleTime) nextScheduleTime.textContent = new Date(stats.nextSchedule.time).toLocaleString() || '없음';
                if (nextScheduleUser) nextScheduleUser.textContent = stats.nextSchedule.userEmail || stats.nextSchedule.userId || '-';
            } else {
                if (nextScheduleTime) nextScheduleTime.textContent = '없음';
                if (nextScheduleUser) nextScheduleUser.textContent = '-';
            }
            
            // Update current date
            if (currentDateSpan) {
                currentDateSpan.textContent = new Date().toLocaleDateString('ko-KR', {
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric', 
                    weekday: 'long'
                });
            }
            
            console.log("Dashboard stats loaded successfully");
        } catch (error) {
            console.error('Error loading dashboard stats:', error);
            // Show error in dashboard somehow, or silently fail
        }
    }

    // --- Data Loading Functions ---
    async function loadUserSettings() {
        console.log("Attempting to load user settings...");
        if (!userSettingsForm) {
            console.warn('User settings form not found.');
            return;
        }
        try {
            const response = await fetch('/api/user/settings');
            if (!response.ok) {
                let errorMsg = `사용자 설정 로드 실패: ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    errorMsg = errorData.message || errorMsg;
                } catch (e) { /* Ignore if response is not json */ }
                throw new Error(errorMsg);
            }
            const settings = await response.json();
            console.log("User settings loaded:", settings);

            // Top level settings (direct properties)
            const elements = userSettingsForm.elements;
            
            // WordPress settings
            if (elements['wpUrl']) elements['wpUrl'].value = settings.wpUrl || '';
            if (elements['wpUsername']) elements['wpUsername'].value = settings.wpUsername || '';
            
            // Handle password field - don't populate the value, just set placeholder
            if (elements['wpPassword']) {
                elements['wpPassword'].value = ''; // Always empty for security
                elements['wpPassword'].placeholder = settings.hasWpPassword ? "앱 비밀번호 저장됨 (변경 시 입력)" : "앱 비밀번호 입력";
            }
            
            // Nested user settings
            const userSettings = settings.userSettings || {};
            
            // API Keys - don't populate values, just set placeholders
            if (elements['openaiApiKey']) {
                elements['openaiApiKey'].value = ''; // Always empty for security
                elements['openaiApiKey'].placeholder = userSettings.hasOpenaiApiKey ? "OpenAI 키 저장됨 (변경 시 입력)" : "sk-...";
            }
            
            if (elements['unsplashApiKey']) {
                elements['unsplashApiKey'].value = ''; // Always empty for security
                elements['unsplashApiKey'].placeholder = userSettings.hasUnsplashApiKey ? "Unsplash 키 저장됨 (변경 시 입력)" : "Unsplash Access Key";
            }
            
            // Other settings
            if (elements['keywords']) elements['keywords'].value = userSettings.keywords?.join(', ') || '';
            if (elements['requiredPhrases']) elements['requiredPhrases'].value = userSettings.requiredPhrases?.join(', ') || '';
            if (elements['linkKeyword']) elements['linkKeyword'].checked = userSettings.linkKeyword || false;
            if (elements['keywordLinkUrl']) elements['keywordLinkUrl'].value = userSettings.keywordLinkUrl || '';
            if (elements['contentStrategy']) elements['contentStrategy'].value = userSettings.contentStrategy || 'ai_only';
            if (elements['contentTone']) elements['contentTone'].value = userSettings.contentTone || 'default';
            if (elements['imageStrategy']) elements['imageStrategy'].value = userSettings.imageStrategy || 'ai';
            if (elements['numImages']) elements['numImages'].value = userSettings.numImages || 3;
            if (elements['defaultLanguage']) elements['defaultLanguage'].value = userSettings.defaultLanguage || 'ko';
            if (elements['scheduleInterval']) elements['scheduleInterval'].value = userSettings.scheduleInterval || 'disabled';

            console.log("Finished populating user settings form");
            showMessage('사용자 설정을 성공적으로 불러왔습니다.', 'success', 'userMessageArea');
        } catch (error) {
            console.error('Error loading user settings:', error);
            showMessage(`사용자 설정 로드 중 오류 발생: ${error.message}`, 'error', 'userMessageArea');
        }
    }

    async function loadSystemSettings() {
        console.log("Attempting to load system settings...");
        if (!systemSettingsForm) {
            console.warn('System settings form not found.');
            return;
        }
        try {
            const response = await fetch('/api/admin/settings');
            if (!response.ok) {
                let errorMsg = `시스템 설정 로드 실패: ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    errorMsg = errorData.message || errorMsg;
                } catch (e) { /* Ignore if response is not json */ }
                throw new Error(errorMsg);
            }
            const settings = await response.json();
            console.log("System settings loaded:", settings);

            const elements = systemSettingsForm.elements;
            
            // API Keys - don't populate values, just set placeholders
            if (elements['systemOpenaiApiKey']) {
                elements['systemOpenaiApiKey'].value = ''; // Always empty for security
                elements['systemOpenaiApiKey'].placeholder = settings.hasOpenaiApiKey ? "OpenAI 시스템 키 저장됨 (변경 시 입력)" : "sk-...";
            }
            
            if (elements['systemUnsplashApiKey']) {
                elements['systemUnsplashApiKey'].value = ''; // Always empty for security
                elements['systemUnsplashApiKey'].placeholder = settings.hasUnsplashApiKey ? "Unsplash 시스템 키 저장됨 (변경 시 입력)" : "Unsplash Access Key";
            }
            
            // Other system settings
            if (elements['defaultGptModel']) elements['defaultGptModel'].value = settings.defaultGptModel || 'gpt-3.5-turbo';
            if (elements['imageGenerationModel']) elements['imageGenerationModel'].value = settings.imageGenerationModel || 'dall-e-2';
            if (elements['enableScheduler']) elements['enableScheduler'].checked = settings.enableScheduler !== false; // Default to true
            if (elements['defaultDailyLimit']) elements['defaultDailyLimit'].value = settings.defaultDailyLimit || 5;
            if (elements['minPostingInterval']) elements['minPostingInterval'].value = settings.minPostingInterval || 10;

            console.log("Finished populating system settings form");
            showMessage('시스템 설정을 성공적으로 불러왔습니다.', 'success', 'systemMessageArea');
        } catch (error) {
            console.error('Error loading system settings:', error);
            showMessage(`시스템 설정 로드 중 오류 발생: ${error.message}`, 'error', 'systemMessageArea');
        }
    }

    async function loadHistory() {
        if (!historyTableBody) return;
        historyTableBody.innerHTML = '<tr><td colspan="6" class="px-4 py-4 text-sm text-gray-500 text-center">기록 로딩 중...</td></tr>';
        try {
            const response = await fetch('/api/admin/history');
            if (!response.ok) {
                throw new Error('포스팅 기록을 불러오는데 실패했습니다.');
            }
            
            const history = await response.json();
            
            if (!history || history.length === 0) {
                historyTableBody.innerHTML = '<tr><td colspan="6" class="px-4 py-4 text-sm text-gray-500 text-center">포스팅 기록이 없습니다.</td></tr>';
                return;
            }
            
            historyTableBody.innerHTML = history.map(item => `
                <tr>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${new Date(item.timestamp).toLocaleString()}</td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm">
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                            ${item.status === 'success' ? 'bg-green-100 text-green-800' : 
                            item.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 
                            'bg-red-100 text-red-800'}">
                            ${item.status === 'success' ? '성공' : 
                            item.status === 'pending' ? '처리중' : '실패'}
                        </span>
                    </td>
                    <td class="px-4 py-3 text-sm text-gray-900">${item.keyword || '-'}</td>
                    <td class="px-4 py-3 text-sm text-gray-500">${item.contentStrategy || '-'}</td>
                    <td class="px-4 py-3 text-sm text-gray-500">${item.platform || 'WordPress'}</td>
                    <td class="px-4 py-3 text-sm text-gray-500">${
                        item.status === 'success' ? 
                        `<a href="${item.postUrl}" target="_blank" class="text-blue-600 hover:text-blue-800">보기</a>` : 
                        (item.error || '-')
                    }</td>
                </tr>
            `).join('');
            
            console.log("History loaded successfully");
        } catch (error) {
            console.error('Error loading history:', error);
            historyTableBody.innerHTML = `<tr><td colspan="6" class="px-4 py-4 text-sm text-red-500 text-center">오류: ${error.message}</td></tr>`;
        }
    }

    async function loadSchedules() {
        if (!scheduleTableBody) return;
        scheduleTableBody.innerHTML = '<tr><td colspan="6" class="px-3 py-4 text-sm text-gray-500 text-center">스케줄 로딩 중...</td></tr>';
        
        try {
            const response = await fetch('/api/admin/schedules');
            if (!response.ok) {
                throw new Error(`스케줄을 불러오는데 실패했습니다. Status: ${response.status}`);
            }
            
            let schedules;
            try {
                schedules = await response.json();
            } catch (jsonError) {
                throw new Error('스케줄 데이터를 파싱하는데 실패했습니다.');
            }
            
            currentSchedules = schedules || []; // Save to memory
            
            if (!schedules || schedules.length === 0) {
                scheduleTableBody.innerHTML = '<tr><td colspan="6" class="px-3 py-4 text-sm text-gray-500 text-center">등록된 스케줄이 없습니다.</td></tr>';
                return;
            }
            
            scheduleTableBody.innerHTML = schedules.map(schedule => `
                <tr>
                    <td class="px-3 py-3 whitespace-nowrap">
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                            ${schedule.isEnabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
                            ${schedule.isEnabled ? '활성' : '비활성'}
                        </span>
                    </td>
                    <td class="px-3 py-3 text-sm text-gray-900">${schedule.name || '-'}</td>
                    <td class="px-3 py-3 text-sm text-gray-500">${schedule.cronPattern || '-'}</td>
                    <td class="px-3 py-3 text-sm text-gray-500">${
                        schedule.keywords ? 
                        (typeof schedule.keywords === 'string' ? 
                            (schedule.keywords.length > 30 ? schedule.keywords.substring(0, 30) + '...' : schedule.keywords) : 
                            (schedule.keywords.join(', ').length > 30 ? schedule.keywords.join(', ').substring(0, 30) + '...' : schedule.keywords.join(', '))) : 
                        '기본값 사용'
                    }</td>
                    <td class="px-3 py-3 text-sm text-gray-500">
                        ${schedule.contentStrategy ? `컨텐츠: ${schedule.contentStrategy}<br>` : ''}
                        ${schedule.imageStrategy ? `이미지: ${schedule.imageStrategy}` : ''}
                    </td>
                    <td class="px-3 py-3 text-sm text-gray-500">
                        <button data-id="${schedule.id}" class="edit-schedule text-blue-600 hover:text-blue-800 mr-2">수정</button>
                        <button data-id="${schedule.id}" class="delete-schedule text-red-600 hover:text-red-800">삭제</button>
                    </td>
                </tr>
            `).join('');
            
            // Add event listeners to edit/delete buttons
            document.querySelectorAll('.edit-schedule').forEach(button => {
                button.addEventListener('click', () => editSchedule(button.dataset.id));
            });
            
            document.querySelectorAll('.delete-schedule').forEach(button => {
                button.addEventListener('click', () => deleteSchedule(button.dataset.id));
            });
            
            console.log("Schedules loaded successfully:", schedules.length);
        } catch (error) {
            console.error('Error loading schedules:', error);
            scheduleTableBody.innerHTML = `<tr><td colspan="6" class="px-3 py-4 text-sm text-red-500 text-center">오류: ${error.message}</td></tr>`;
        }
    }

    // --- Form Handlers ---
    // User Settings Form
    if (userSettingsForm) {
        userSettingsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(userSettingsForm);
            const userData = {};
            
            // Basic properties directly from form
            for (const [key, value] of formData.entries()) {
                // Skip empty password fields
                if ((key === 'wpPassword' || key === 'openaiApiKey' || key === 'unsplashApiKey') && !value) {
                    continue;
                }
                
                if (key === 'keywords' || key === 'requiredPhrases') {
                    // Convert comma-separated string to array and trim values
                    userData[key] = value.split(',')
                        .map(item => item.trim())
                        .filter(item => item.length > 0);
                } else if (key === 'numImages') {
                    // Convert numeric strings to numbers
                    userData[key] = parseInt(value, 10) || 0;
                } else if (key === 'linkKeyword') {
                    // Handle checkbox boolean value
                    userData[key] = value === 'on';
                } else {
                    userData[key] = value;
                }
            }
            
            // Handle checkbox that might not be in formData if unchecked
            if (!formData.has('linkKeyword')) {
                userData.linkKeyword = false;
            }
            
            console.log('Submitting user settings:', userData);
            
            try {
                const response = await fetch('/api/user/settings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(userData),
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || '설정 저장 중 오류가 발생했습니다.');
                }
                
                const result = await response.json();
                console.log('User settings saved successfully:', result);
                
                // Clear sensitive fields
                if (userSettingsForm.elements['wpPassword']) 
                    userSettingsForm.elements['wpPassword'].value = '';
                if (userSettingsForm.elements['openaiApiKey']) 
                    userSettingsForm.elements['openaiApiKey'].value = '';
                if (userSettingsForm.elements['unsplashApiKey']) 
                    userSettingsForm.elements['unsplashApiKey'].value = '';
                
                showMessage('사용자 설정이 성공적으로 저장되었습니다.', 'success', 'userMessageArea');
            } catch (error) {
                console.error('Error saving user settings:', error);
                showMessage(`설정 저장 중 오류: ${error.message}`, 'error', 'userMessageArea');
            }
        });
    }

    // System Settings Form
    if (systemSettingsForm) {
        systemSettingsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(systemSettingsForm);
            const systemData = {};
            
            // Convert form data to object with proper types
            for (const [key, value] of formData.entries()) {
                // Skip empty API key fields
                if ((key === 'systemOpenaiApiKey' || key === 'systemUnsplashApiKey') && !value) {
                    continue;
                }
                
                if (key === 'enableScheduler') {
                    systemData[key] = value === 'on';
                } else if (key === 'defaultDailyLimit' || key === 'minPostingInterval') {
                    systemData[key] = parseInt(value, 10) || 0;
                } else {
                    systemData[key] = value;
                }
            }
            
            // Handle checkbox that might not be in formData if unchecked
            if (!formData.has('enableScheduler')) {
                systemData.enableScheduler = false;
            }
            
            console.log('Submitting system settings:', Object.keys(systemData));
            
            try {
                const response = await fetch('/api/admin/settings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(systemData),
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || '시스템 설정 저장 중 오류가 발생했습니다.');
                }
                
                // Clear sensitive fields
                if (systemSettingsForm.elements['systemOpenaiApiKey']) 
                    systemSettingsForm.elements['systemOpenaiApiKey'].value = '';
                if (systemSettingsForm.elements['systemUnsplashApiKey']) 
                    systemSettingsForm.elements['systemUnsplashApiKey'].value = '';
                
                showMessage('시스템 설정이 성공적으로 저장되었습니다.', 'success', 'systemMessageArea');
                
                // Reload dashboard stats
                loadDashboardStats();
            } catch (error) {
                console.error('Error saving system settings:', error);
                showMessage(`시스템 설정 저장 중 오류: ${error.message}`, 'error', 'systemMessageArea');
            }
        });
    }

    // --- Schedule Handling ---
    // Show schedule form
    function showScheduleForm(isEditing = false, scheduleId = null) {
        if (!scheduleFormContainer || !scheduleFormTitle) return;
        
        scheduleFormTitle.textContent = isEditing ? '스케줄 수정' : '새 스케줄 추가';
        scheduleFormContainer.classList.remove('hidden');
        
        if (isEditing && scheduleId) {
            // Find the schedule in currentSchedules memory
            const schedule = currentSchedules.find(s => s.id === scheduleId);
            if (schedule && scheduleFormElement) {
                // Populate form with schedule data
                if (scheduleIdInput) scheduleIdInput.value = schedule.id;
                
                const elements = scheduleFormElement.elements;
                if (elements['isEnabled']) elements['isEnabled'].checked = schedule.isEnabled;
                if (elements['name']) elements['name'].value = schedule.name || '';
                if (elements['cronPattern']) elements['cronPattern'].value = schedule.cronPattern || '';
                if (elements['scheduleKeywords']) elements['scheduleKeywords'].value = 
                    Array.isArray(schedule.keywords) ? schedule.keywords.join(', ') : schedule.keywords || '';
                if (elements['scheduleContentStrategy']) elements['scheduleContentStrategy'].value = schedule.contentStrategy || '';
                if (elements['scheduleImageStrategy']) elements['scheduleImageStrategy'].value = schedule.imageStrategy || '';
            } else {
                console.error('Schedule not found for editing:', scheduleId);
                // You might want to fetch it from the server instead
                fetchScheduleForEditing(scheduleId);
            }
        } else {
            // Reset form for new schedule
            if (scheduleFormElement) scheduleFormElement.reset();
            if (scheduleIdInput) scheduleIdInput.value = '';
        }
    }

    // Fetch a specific schedule for editing
    async function fetchScheduleForEditing(scheduleId) {
        try {
            const response = await fetch(`/api/admin/schedules/${scheduleId}`);
            if (!response.ok) {
                throw new Error('스케줄 정보를 가져오는데 실패했습니다.');
            }
            
            const schedule = await response.json();
            if (schedule) {
                // Now populate the form
                const elements = scheduleFormElement.elements;
                if (scheduleIdInput) scheduleIdInput.value = schedule.id;
                if (elements['isEnabled']) elements['isEnabled'].checked = schedule.isEnabled;
                if (elements['name']) elements['name'].value = schedule.name || '';
                if (elements['cronPattern']) elements['cronPattern'].value = schedule.cronPattern || '';
                if (elements['scheduleKeywords']) elements['scheduleKeywords'].value = 
                    Array.isArray(schedule.keywords) ? schedule.keywords.join(', ') : schedule.keywords || '';
                if (elements['scheduleContentStrategy']) elements['scheduleContentStrategy'].value = schedule.contentStrategy || '';
                if (elements['scheduleImageStrategy']) elements['scheduleImageStrategy'].value = schedule.imageStrategy || '';
            }
        } catch (error) {
            console.error('Error fetching schedule for editing:', error);
            alert('스케줄 정보를 가져오는데 실패했습니다: ' + error.message);
        }
    }

    // Edit schedule
    async function editSchedule(scheduleId) {
        showScheduleForm(true, scheduleId);
    }

    // Delete schedule
    async function deleteSchedule(scheduleId) {
        if (!confirm('이 스케줄을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
        
        try {
            const response = await fetch(`/api/admin/schedules/${scheduleId}`, { 
                method: 'DELETE' 
            });
            
            if (!response.ok) {
                throw new Error('스케줄 삭제에 실패했습니다.');
            }
            
            // Reload schedules 
            loadSchedules();
        } catch (error) {
            console.error('Error deleting schedule:', error);
            alert('스케줄 삭제 중 오류가 발생했습니다: ' + error.message);
        }
    }

    // Schedule form submission
    if (scheduleFormElement) {
        scheduleFormElement.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(scheduleFormElement);
            const scheduleData = {};
            const scheduleId = scheduleIdInput ? scheduleIdInput.value : '';
            const isEditing = !!scheduleId;
            
            // Convert form data to object with proper types
            for (const [key, value] of formData.entries()) {
                if (key === 'isEnabled') {
                    scheduleData[key] = value === 'on';
                } else if (key === 'keywords' || key === 'scheduleKeywords') {
                    // Normalize the field name
                    scheduleData['keywords'] = value.split(',')
                        .map(item => item.trim())
                        .filter(item => item.length > 0);
                } else {
                    scheduleData[key] = value;
                }
            }
            
            // Handle checkbox that might not be in formData if unchecked
            if (!formData.has('isEnabled')) {
                scheduleData.isEnabled = false;
            }
            
            console.log(`${isEditing ? 'Updating' : 'Creating'} schedule:`, scheduleData);
            
            try {
                const url = isEditing 
                    ? `/api/admin/schedules/${scheduleId}`
                    : '/api/admin/schedules';
                    
                const response = await fetch(url, {
                    method: isEditing ? 'PUT' : 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(scheduleData),
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || '스케줄 저장 중 오류가 발생했습니다.');
                }
                
                // Hide form and reload schedules
                if (scheduleFormContainer) scheduleFormContainer.classList.add('hidden');
                loadSchedules();
            } catch (error) {
                console.error('Error saving schedule:', error);
                alert('스케줄 저장 중 오류가 발생했습니다: ' + error.message);
            }
        });
    }

    // Cancel button
    if (cancelScheduleEditBtn) {
        cancelScheduleEditBtn.addEventListener('click', () => {
            if (scheduleFormContainer) scheduleFormContainer.classList.add('hidden');
        });
    }

    // Add schedule button
    if (addScheduleBtn) {
        addScheduleBtn.addEventListener('click', () => {
            showScheduleForm(false);
        });
    }

    // --- Dashboard Actions ---
    // Post now button
    if (postNowBtn) {
        postNowBtn.addEventListener('click', async () => {
            if (!confirm('지금 바로 포스팅을 시작하시겠습니까?')) return;
            
            try {
                postNowBtn.disabled = true;
                postNowBtn.textContent = '처리 중...';
                
                const response = await fetch('/api/post/now', { method: 'POST' });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || '포스팅 요청 중 오류가 발생했습니다.');
                }
                
                alert('포스팅 요청이 성공적으로 전송되었습니다. 결과는 포스팅 기록에서 확인할 수 있습니다.');
                
                // Reload dashboard stats
                loadDashboardStats();
                
                // If history tab is visible, reload history too
                if (!document.getElementById('historyContent').classList.contains('hidden')) {
                    loadHistory();
                }
            } catch (error) {
                console.error('Error posting now:', error);
                alert('포스팅 요청 중 오류가 발생했습니다: ' + error.message);
            } finally {
                postNowBtn.disabled = false;
                postNowBtn.textContent = '지금 포스팅하기';
            }
        });
    }

    // Refresh stats button
    if (refreshStatsBtn) {
        refreshStatsBtn.addEventListener('click', () => {
            loadDashboardStats();
        });
    }

    // Refresh history button
    if (refreshHistoryButton) {
        refreshHistoryButton.addEventListener('click', () => {
            loadHistory();
        });
    }

    // --- Initialization ---
    // Set current date
    if (currentDateSpan) {
        currentDateSpan.textContent = new Date().toLocaleDateString('ko-KR', {
            year: 'numeric', 
            month: 'long', 
            day: 'numeric', 
            weekday: 'long'
        });
    }

    // Check for hash in URL
    function checkHashAndActivateTab() {
        const hash = window.location.hash.substring(1); // Remove the # character
        if (hash) {
            const targetId = hash + 'Content'; // e.g. #dashboard -> dashboardContent
            if (document.getElementById(targetId)) {
                activateTab(targetId);
                return true;
            }
        }
        return false;
    }

    // If no hash or invalid hash, activate dashboard tab
    if (!checkHashAndActivateTab()) {
        activateTab('dashboardContent');
    }

    // Listen for hashchange events
    window.addEventListener('hashchange', checkHashAndActivateTab);

    console.log('Admin dashboard initialized');

    // 인증 상태 확인
    function checkAuthentication() {
        const token = localStorage.getItem('authToken');
        
        if (!token) {
            // 토큰이 없으면 로그인 페이지로 리디렉션
            window.location.href = '/login.html';
            return;
        }
        
        // 사용자 정보 가져오기 (선택적)
        fetch('/api/auth/me', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Unauthorized');
            }
            return response.json();
        })
        .then(data => {
            if (!data.success || !data.data) {
                throw new Error('Invalid user data');
            }
            
            // 관리자 권한 확인
            if (data.data.role !== 'admin') {
                alert('관리자 권한이 필요합니다.');
                window.location.href = '/dashboard.html';
            }
            
            // 사용자 정보 표시 (선택적)
            displayUserInfo(data.data);
        })
        .catch(error => {
            console.error('Authentication error:', error);
            localStorage.removeItem('authToken');
            window.location.href = '/login.html';
        });
    }

    // 사용자 정보 표시
    function displayUserInfo(user) {
        const userInfoElement = document.getElementById('userInfo');
        if (userInfoElement) {
            userInfoElement.textContent = user.username || user.email;
        }
        
        // 로그아웃 버튼 설정
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', function() {
                logout();
            });
        }
    }

    // 로그아웃 함수
    function logout() {
        const token = localStorage.getItem('authToken');
        
        fetch('/api/auth/logout', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
        .then(() => {
            localStorage.removeItem('authToken');
            window.location.href = '/login.html';
        })
        .catch(error => {
            console.error('Logout error:', error);
            localStorage.removeItem('authToken');
            window.location.href = '/login.html';
        });
    }

    // 페이지 로드 시 인증 확인
    checkAuthentication();
}); 