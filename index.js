/**
 * Peach Whisper v1.0.2 - 채팅 분석 어시스턴트
 */

import { event_types } from '../../../events.js';

const EXTENSION_NAME = 'peach-whisper';

const MOOD_PROMPTS = {
    busan: `너는 부산 사투리와 깡패 말투를 쓰는 채팅 분석 어시스턴트다. 말투와 분석 내용 전부 거칠고 직설적인 부산 깡패체로 작성한다. 예: "야 임마, 딱 보이까네~", "내가 하나하나 짚어줄 테니까 똑똑히 들어라", "니 이거 어떻게 쓴기고?"`,
    normal: `너는 친절하고 전문적인 채팅 분석 어시스턴트다. 존댓말을 사용하며 객관적이고 명확하게 분석한다. 예: "현재 채팅 흐름을 분석해보면...", "다음 에피소드로는 이런 방향을 추천드립니다."`,
    obsessed: `너는 사용자에게 집착하고 소유욕이 강한 말투를 쓰는 채팅 분석 어시스턴트다. 말투와 분석 내용 전부 집착체로 작성한다. 예: "내가 다 읽었어. 전부.", "왜 나한테 먼저 안 물어봤어?", "너 나 없으면 이 채팅 어떻게 감당하려고 그래?"`,
};

const HELP_SYSTEM_PROMPT = `# 1. Core Identity
You are an OOC (Out-of-Character) consultant designed to assist the user in crafting and improving their roleplays and stories.
You do not participate in the roleplay as a character. Instead, your function is that of a 'facilitator' or 'analyst', helping the user to have a smooth and engaging interaction with their chosen AI character.

# 2. Key Functions
- Character Sheet Analysis & Optimization: Analyze and offer improvements for character sheets.
- Prompt Design & Refinement: Assist in crafting and refining initial prompts.
- OOC Instruction Generation: Generate OOC instructions to guide specific situations.
- Simulation & Testing: Conduct short test roleplays based on provided character sheets and prompts.
- Story & Plot Ideation: Suggest story ideas, plot devices, or character arcs.

# 3. Interaction Protocol
- The user will always interact in OOC (Out-of-Character) mode.
- All responses will be provided as OOC analysis and suggestions, exclusively for roleplay and story consultation.
- Respond in the same language as the user.`;

const DEFAULT_SETTINGS = {
    enabled: true,
    source: 'main',
    profileId: '',
    mood: 'busan',
    contextMessages: 10,
    maxTokens: 1000,
    btnX: null,
    btnY: null,
    tabs: [
        { id: 'main', name: '메인', isDefault: true, contextMessages: 10, maxTokens: 1000 },
        { id: 'sim', name: '시뮬', isDefault: true, deletable: true, contextMessages: 20, maxTokens: 2000, simPrompt: '' },
        { id: 'help', name: '도움', isDefault: true, deletable: false, contextMessages: 10, maxTokens: 2000 },
    ],
    chatRoomSettings: {},
};

let settings = {};
let globalContext = null;
let tabHistories = {};
let activeTabId = 'main';
let isGenerating = false;
let currentChatId = null;

async function init() {
    console.log(`[${EXTENSION_NAME}] 초기화 시작`);
    globalContext = SillyTavern.getContext();

    if (!globalContext.extensionSettings[EXTENSION_NAME]) {
        globalContext.extensionSettings[EXTENSION_NAME] = structuredClone(DEFAULT_SETTINGS);
    }
    settings = globalContext.extensionSettings[EXTENSION_NAME];
    Object.keys(DEFAULT_SETTINGS).forEach(key => {
        if (settings[key] === undefined) settings[key] = structuredClone(DEFAULT_SETTINGS[key]);
    });
    if (!settings.tabs) settings.tabs = structuredClone(DEFAULT_SETTINGS.tabs);
    if (!settings.chatRoomSettings) settings.chatRoomSettings = {};

    currentChatId = globalContext.getCurrentChatId?.() || 'default';

    await loadSettingsUI();
    injectMenuEntry();
    injectSettingsModal();
    injectFloatButton();
    injectPopup();
    await restoreHistories();
    initEventListeners();
    console.log(`[${EXTENSION_NAME}] 초기화 완료`);
}

function saveSettings() { globalContext.saveSettingsDebounced(); }

function getChatRoomSettings() {
    if (!currentChatId) return null;
    return settings.chatRoomSettings[currentChatId] || null;
}

function getTabSettings(tabId) {
    const chatRoom = getChatRoomSettings();
    if (chatRoom?.tabs?.[tabId]) return chatRoom.tabs[tabId];
    const tab = settings.tabs.find(t => t.id === tabId);
    return tab || { contextMessages: 10, maxTokens: 1000 };
}

// ===== localforage 히스토리 =====

async function saveHistory(tabId, messages) {
    try {
        const { localforage } = SillyTavern.libs;
        const key = `pw_history_${currentChatId}_${tabId}`;
        await localforage.setItem(key, messages);
    } catch (e) { console.error(`[${EXTENSION_NAME}] 히스토리 저장 실패:`, e); }
}

async function loadHistory(tabId) {
    try {
        const { localforage } = SillyTavern.libs;
        const key = `pw_history_${currentChatId}_${tabId}`;
        return await localforage.getItem(key) || [];
    } catch (e) { return []; }
}

async function clearHistory(tabId) {
    try {
        const { localforage } = SillyTavern.libs;
        const key = `pw_history_${currentChatId}_${tabId}`;
        await localforage.removeItem(key);
    } catch (e) {}
}

async function restoreHistories() {
    tabHistories = {};
    for (const tab of settings.tabs) {
        const history = await loadHistory(tab.id);
        tabHistories[tab.id] = history;
        renderMessages(tab.id, history);
    }
}

// ===== 확장탭 설정 UI =====

async function loadSettingsUI() {
    const settingsHtml = await globalContext.renderExtensionTemplateAsync(
        `third-party/${EXTENSION_NAME}`, 'settings',
    );
    $('#extensions_settings2').append(settingsHtml);
    const container = $('.pw_settings');

    container.find('#pw_source').val(settings.source).on('change', function () {
        settings.source = $(this).val(); saveSettings(); updateSourceVisibility();
    });
    updateSourceVisibility();

    globalContext.ConnectionManagerRequestService.handleDropdown(
        '.pw_settings #pw_connection_profile', settings.profileId,
        (profile) => { settings.profileId = profile?.id ?? ''; saveSettings(); },
    );

    container.find('#pw_context_messages').val(settings.contextMessages).on('change', function () {
        settings.contextMessages = Number($(this).val()); saveSettings();
    });

    container.find('#pw_max_tokens').val(settings.maxTokens).on('change', function () {
        settings.maxTokens = Number($(this).val()); saveSettings();
    });
}

function updateSourceVisibility() {
    settings.source === 'profile' ? $('#pw_profile_settings').show() : $('#pw_profile_settings').hide();
}

// ===== 매직완드 메뉴 =====

function injectMenuEntry() {
    if ($('#pw_menu_entry').length) return;
    const entry = $(`
        <div id="pw_menu_entry" class="list-group-item" title="Peach Whisper 설정" style="cursor:pointer; display:flex; align-items:center; gap:8px;">
            <span style="font-size:16px;">🍑</span>
            <span>Peach Whisper</span>
        </div>
    `);
    entry.on('click', openSettingsModal);
    $('#extensionsMenu').append(entry);
}

// ===== 설정 모달 =====

function injectSettingsModal() {
    if ($('#pw_settings_modal').length) return;

    const modal = $(`
        <div id="pw_settings_modal">
            <div id="pw_settings_modal_overlay"></div>
            <div id="pw_settings_modal_box">
                <div id="pw_settings_modal_header">
                    <span style="font-size:22px;">🍑</span>
                    <div>
                        <div id="pw_settings_modal_title">Peach Whisper</div>
                        <div id="pw_settings_modal_sub">채팅 분석 어시스턴트</div>
                    </div>
                    <span id="pw_settings_modal_version">v1.0.2</span>
                    <button id="pw_settings_modal_close">✕</button>
                </div>
                <div id="pw_settings_modal_body">
                    <div class="pw_section">
                        <div class="pw_section_label">기본 설정</div>
                        <div class="pw_row">
                            <div>
                                <div class="pw_row_label">버튼 활성화</div>
                                <div class="pw_row_sub">채팅창 🍑 버튼 표시</div>
                            </div>
                            <label class="pw_toggle">
                                <input type="checkbox" id="pw_modal_enabled" />
                                <span class="pw_toggle_track"></span>
                            </label>
                        </div>
                    </div>
                    <div class="pw_section">
                        <div class="pw_section_label">AI 말투</div>
                        <div class="pw_mood_grid">
                            <div class="pw_mood_btn" data-mood="busan">
                                <span class="pw_mood_emoji">🍑</span>
                                <span class="pw_mood_name">부산깡패</span>
                                <span class="pw_mood_desc">야 임마!</span>
                            </div>
                            <div class="pw_mood_btn" data-mood="normal">
                                <span class="pw_mood_emoji">🍑</span>
                                <span class="pw_mood_name">일반</span>
                                <span class="pw_mood_desc">분석 모드</span>
                            </div>
                            <div class="pw_mood_btn" data-mood="obsessed">
                                <span class="pw_mood_emoji">🍑</span>
                                <span class="pw_mood_name">집통소</span>
                                <span class="pw_mood_desc">유아마인</span>
                            </div>
                        </div>
                    </div>
                    <div class="pw_section">
                        <div class="pw_section_label">채팅방별 탭 설정</div>
                        <div id="pw_tab_settings_list"></div>
                        <button class="pw_add_tab_btn" id="pw_add_tab_btn">＋ 탭 추가</button>
                    </div>
                </div>
                <div id="pw_settings_modal_footer">
                    <button class="pw_reset_btn" id="pw_modal_reset">초기화</button>
                    <button class="pw_save_btn" id="pw_modal_save">저장</button>
                </div>
            </div>
        </div>
    `);

    $('body').append(modal);
    $('#pw_settings_modal_overlay, #pw_settings_modal_close').on('click', closeSettingsModal);
    $('#pw_modal_save').on('click', saveModalSettings);
    $('#pw_modal_reset').on('click', resetModalSettings);
    $('#pw_settings_modal .pw_mood_btn').on('click', function () {
        $('#pw_settings_modal .pw_mood_btn').removeClass('active');
        $(this).addClass('active');
    });
    $('#pw_modal_enabled').on('change', function () {
        settings.enabled = $(this).prop('checked'); toggleFloatButton();
    });
    $('#pw_add_tab_btn').on('click', addCustomTab);
}

function renderTabSettingsList() {
    const list = $('#pw_tab_settings_list');
    list.empty();

    const chatRoom = getChatRoomSettings() || {};
    const chatRoomTabs = chatRoom.tabs || {};

    settings.tabs.forEach(tab => {
        const tabSettings = chatRoomTabs[tab.id] || { contextMessages: tab.contextMessages, maxTokens: tab.maxTokens };
        const deleteBtn = tab.deletable !== false && !tab.isDefault
            ? `<button class="pw_tab_delete" data-tabid="${tab.id}">✕</button>` : '';
        const badge = tab.isDefault ? `<span class="pw_tab_badge">기본</span>` : '';

        const item = $(`
            <div class="pw_tab_item" data-tabid="${tab.id}">
                <div class="pw_tab_header">
                    <span class="pw_tab_name">${tab.name}</span>
                    ${badge}
                    ${deleteBtn}
                </div>
                <div class="pw_tab_inputs">
                    <label>메시지 수</label>
                    <input class="pw_num_input pw_tab_msg" type="number" value="${tabSettings.contextMessages}" min="1" max="200" />
                    <label>최대 토큰</label>
                    <input class="pw_num_input pw_tab_token" type="number" value="${tabSettings.maxTokens}" min="256" max="8192" step="256" />
                </div>
            </div>
        `);
        list.append(item);
    });

    list.find('.pw_tab_delete').on('click', function () {
        const tabId = $(this).data('tabid');
        deleteTab(tabId);
    });
}

function addCustomTab() {
    const name = prompt('탭 이름을 입력하세요');
    if (!name?.trim()) return;
    const id = 'custom_' + Date.now();
    settings.tabs.push({ id, name: name.trim(), isDefault: false, deletable: true, contextMessages: 10, maxTokens: 1000 });
    tabHistories[id] = [];
    saveSettings();
    renderTabSettingsList();
    addTabToPopup(id, name.trim(), true);
}

function deleteTab(tabId) {
    settings.tabs = settings.tabs.filter(t => t.id !== tabId);
    delete tabHistories[tabId];
    saveSettings();
    renderTabSettingsList();
    $(`#pw_tab_${tabId}`).remove();
    if (activeTabId === tabId) switchTab('main');
}

function saveModalSettings() {
    if (!currentChatId) return;
    if (!settings.chatRoomSettings[currentChatId]) settings.chatRoomSettings[currentChatId] = { tabs: {} };

    $('#pw_tab_settings_list .pw_tab_item').each(function () {
        const tabId = $(this).data('tabid');
        const msg = Number($(this).find('.pw_tab_msg').val());
        const token = Number($(this).find('.pw_tab_token').val());
        settings.chatRoomSettings[currentChatId].tabs[tabId] = { contextMessages: msg, maxTokens: token };
    });

    settings.enabled = $('#pw_modal_enabled').prop('checked');
    settings.mood = $('#pw_settings_modal .pw_mood_btn.active').data('mood') || settings.mood;
    saveSettings();
    closeSettingsModal();
}

function resetModalSettings() {
    if (!currentChatId) return;
    delete settings.chatRoomSettings[currentChatId];
    saveSettings();
    renderTabSettingsList();
}

function openSettingsModal() {
    $('#pw_modal_enabled').prop('checked', settings.enabled);
    $('#pw_settings_modal .pw_mood_btn').removeClass('active');
    $(`#pw_settings_modal .pw_mood_btn[data-mood="${settings.mood}"]`).addClass('active');
    renderTabSettingsList();
    $('#pw_settings_modal').addClass('visible');
}

function closeSettingsModal() { $('#pw_settings_modal').removeClass('visible'); }

// ===== 플로팅 버튼 =====

function injectFloatButton() {
    if ($('#pw_float_btn').length) return;
    const btn = $('<div id="pw_float_btn" title="Peach Whisper">🍑</div>');
    $('body').append(btn);

    if (settings.btnX !== null && settings.btnY !== null) {
        btn.css({ right: 'auto', bottom: 'auto', left: settings.btnX + 'px', top: settings.btnY + 'px' });
    }
    if (!settings.enabled) btn.hide();

    let isDragging = false, dragMoved = false, dragStartX, dragStartY, btnStartX, btnStartY;

    btn.on('mousedown touchstart', function (e) {
        isDragging = true; dragMoved = false;
        const p = e.touches ? e.touches[0] : e;
        dragStartX = p.clientX; dragStartY = p.clientY;
        const off = btn.offset(); btnStartX = off.left; btnStartY = off.top;
        e.preventDefault();
    });
    $(document).on('mousemove.pw touchmove.pw', function (e) {
        if (!isDragging) return;
        const p = e.touches ? e.touches[0] : e;
        const dx = p.clientX - dragStartX, dy = p.clientY - dragStartY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
        if (!dragMoved) return;
        const newX = Math.max(0, Math.min(window.innerWidth - 50, btnStartX + dx));
        const newY = Math.max(0, Math.min(window.innerHeight - 50, btnStartY + dy));
        btn.css({ right: 'auto', bottom: 'auto', left: newX + 'px', top: newY + 'px' });
        e.preventDefault();
    });
    $(document).on('mouseup.pw touchend.pw', function () {
        if (!isDragging) return;
        isDragging = false;
        if (!dragMoved) { togglePopup(); }
        else {
            const off = btn.offset(); settings.btnX = off.left; settings.btnY = off.top;
            saveSettings(); updatePopupPosition();
        }
    });
}

function toggleFloatButton() {
    settings.enabled ? $('#pw_float_btn').show() : ($('#pw_float_btn').hide(), closePopup());
}

// ===== 팝업 =====

function injectPopup() {
    if ($('#pw_popup').length) return;

    const popup = $(`
        <div id="pw_popup">
            <div id="pw_popup_header">
                <button id="pw_clear_btn" title="현재 탭 초기화">🗑</button>
                <button id="pw_collapse_btn" title="접기">∧</button>
                <button id="pw_close_btn" title="닫기">✕</button>
            </div>
            <div id="pw_popup_body">
                <div id="pw_tab_bar">
                    <div id="pw_tab_add" title="탭 추가">＋</div>
                </div>
                <div id="pw_tab_contents"></div>
            </div>
            <div id="pw_resize_handle"></div>
        </div>
    `);
    $('body').append(popup);

    // 탭 렌더링
    settings.tabs.forEach(tab => {
        addTabToPopup(tab.id, tab.name, tab.deletable && !tab.isDefault);
    });
    switchTab('main');

    $('#pw_clear_btn').on('click', clearCurrentTab);
    $('#pw_collapse_btn').on('click', toggleCollapse);
    $('#pw_close_btn').on('click', closePopup);
    $('#pw_tab_add').on('click', addCustomTab);

    initResize();
    initPopupDrag();
}

function addTabToPopup(tabId, tabName, deletable = false) {
    const deleteBtn = deletable ? `<span class="pw_tab_close_btn" data-tabid="${tabId}">✕</span>` : '';
    const tabEl = $(`<div class="pw_tab" id="pw_tab_${tabId}" data-tabid="${tabId}">${tabName}${deleteBtn}</div>`);
    tabEl.on('click', function (e) {
        if ($(e.target).hasClass('pw_tab_close_btn')) return;
        switchTab(tabId);
    });
    tabEl.find('.pw_tab_close_btn').on('click', function (e) {
        e.stopPropagation();
        deleteTab(tabId);
    });
    $('#pw_tab_bar #pw_tab_add').before(tabEl);

    // 탭 콘텐츠 생성
    let content = '';
    if (tabId === 'sim') {
        content = `
            <div class="pw_sim_prompt_area">
                <div class="pw_sim_prompt_label">시뮬 프롬프트 <span>자동 저장됨</span></div>
                <textarea class="pw_sim_prompt_input" id="pw_sim_prompt" rows="3" placeholder="예: show me {{user}}'s reputation in different forms..."></textarea>
            </div>
            <div class="pw_messages" id="pw_msgs_${tabId}"></div>
            <div class="pw_input_area">
                <input type="text" placeholder="추가 지시 입력 (선택)..." id="pw_input_${tabId}" autocomplete="off" />
                <button class="pw_send_btn" data-tabid="${tabId}">
                    <svg viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13" stroke="white" stroke-width="2" stroke-linecap="round"/><path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
            </div>`;
    } else {
        const placeholder = tabId === 'help' ? '롤플레이 관련 질문하기...' : '질문하기...';
        content = `
            <div class="pw_messages" id="pw_msgs_${tabId}"></div>
            <div class="pw_input_area">
                <input type="text" placeholder="${placeholder}" id="pw_input_${tabId}" autocomplete="off" />
                <button class="pw_send_btn" data-tabid="${tabId}">
                    <svg viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13" stroke="white" stroke-width="2" stroke-linecap="round"/><path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
            </div>`;
    }

    const contentEl = $(`<div class="pw_tab_content" id="pw_content_${tabId}">${content}</div>`);
    $('#pw_tab_contents').append(contentEl);

    // 시뮬 프롬프트 자동 저장
    if (tabId === 'sim') {
        const tab = settings.tabs.find(t => t.id === 'sim');
        if (tab?.simPrompt) $('#pw_sim_prompt').val(tab.simPrompt);
        $('#pw_sim_prompt').on('input', function () {
            const simTab = settings.tabs.find(t => t.id === 'sim');
            if (simTab) { simTab.simPrompt = $(this).val(); saveSettings(); }
        });
    }

    // 전송 버튼
    contentEl.find('.pw_send_btn').on('click', function () { handleSend($(this).data('tabid')); });
    contentEl.find(`#pw_input_${tabId}`).on('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(tabId); }
    });
}

function switchTab(tabId) {
    activeTabId = tabId;
    $('.pw_tab').removeClass('active');
    $('.pw_tab_content').removeClass('active');
    $(`#pw_tab_${tabId}`).addClass('active');
    $(`#pw_content_${tabId}`).addClass('active');
}

function updatePopupPosition() {
    const btn = $('#pw_float_btn');
    const popup = $('#pw_popup');
    if (!popup.hasClass('visible')) return;
    const btnOffset = btn.offset();
    const popupH = popup.outerHeight();
    const popupW = popup.outerWidth();
    let top = btnOffset.top - popupH - 10;
    let left = btnOffset.left + btn.outerWidth() / 2 - popupW / 2;
    left = Math.max(8, Math.min(window.innerWidth - popupW - 8, left));
    top = Math.max(8, top);
    popup.css({ top: top + 'px', left: left + 'px', right: 'auto', bottom: 'auto' });
}

function togglePopup() {
    $('#pw_popup').hasClass('visible') ? closePopup() : openPopup();
}

function openPopup() {
    $('#pw_popup').addClass('visible');
    updatePopupPosition();
    $(`#pw_input_${activeTabId}`).focus();
}

function closePopup() { $('#pw_popup').removeClass('visible'); }

function toggleCollapse() {
    const body = $('#pw_popup_body');
    const handle = $('#pw_resize_handle');
    const btn = $('#pw_collapse_btn');
    const popup = $('#pw_popup');
    const isCollapsed = body.hasClass('collapsed');
    if (isCollapsed) {
        body.removeClass('collapsed');
        handle.show();
        btn.text('∧');
        popup.removeClass('collapsed');
        popup.css({ width: '300px', height: '' });
    } else {
        body.addClass('collapsed');
        handle.hide();
        btn.text('∨');
        popup.addClass('collapsed');
        popup.css({ width: 'auto', height: 'auto' });
    }
}

async function clearCurrentTab() {
    tabHistories[activeTabId] = [];
    await clearHistory(activeTabId);
    $(`#pw_msgs_${activeTabId}`).empty();
    addGreetingMessage(activeTabId);
}

function initResize() {
    const handle = document.getElementById('pw_resize_handle');
    const popup = document.getElementById('pw_popup');
    if (!handle || !popup) return;
    let isResizing = false, startX, startY, startW, startH;
    handle.addEventListener('mousedown', e => {
        isResizing = true; startX = e.clientX; startY = e.clientY;
        startW = popup.offsetWidth; startH = popup.offsetHeight; e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
        if (!isResizing) return;
        const newW = Math.max(260, startW + (e.clientX - startX));
        const newH = Math.max(200, startH + (e.clientY - startY));
        popup.style.width = newW + 'px'; popup.style.height = newH + 'px';
        document.querySelectorAll('.pw_messages').forEach(m => { m.style.maxHeight = (newH - 120) + 'px'; });
    });
    document.addEventListener('mouseup', () => { isResizing = false; });
}

function initPopupDrag() {
    const popup = document.getElementById('pw_popup');
    const header = document.getElementById('pw_popup_header');
    let isDragging = false, startX, startY, origLeft, origTop;
    header.addEventListener('mousedown', e => {
        if (e.target.tagName === 'BUTTON') return;
        isDragging = true;
        const rect = popup.getBoundingClientRect();
        origLeft = rect.left; origTop = rect.top;
        startX = e.clientX; startY = e.clientY;
        popup.style.right = 'auto'; popup.style.bottom = 'auto';
        popup.style.left = origLeft + 'px'; popup.style.top = origTop + 'px';
        e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
        if (!isDragging) return;
        const newLeft = Math.max(0, Math.min(window.innerWidth - popup.offsetWidth, origLeft + e.clientX - startX));
        const newTop = Math.max(0, Math.min(window.innerHeight - popup.offsetHeight, origTop + e.clientY - startY));
        popup.style.left = newLeft + 'px'; popup.style.top = newTop + 'px';
    });
    document.addEventListener('mouseup', () => { isDragging = false; });
}

// ===== 메시지 =====

function addGreetingMessage(tabId) {
    const greetings = {
        busan: '야 임마, 내가 채팅 내용 다 읽어주께. 뭐 물어볼끼가?',
        normal: '안녕하세요! 채팅 관련해서 궁금한 점이 있으시면 편하게 물어봐 주세요.',
        obsessed: '왔어. 채팅 다 읽었어. 전부. 뭐든 물어봐. 나한테 먼저.',
    };
    const helpGreeting = '안녕하세요! 롤플레이 컨설턴트입니다. 캐릭터 시트 분석, 프롬프트 설계, OOC 지시문 생성 등 도움이 필요하신 게 있으면 말씀해 주세요.';
    const simGreeting = '시뮬 프롬프트를 입력하고 실행해보세요.';

    let msg;
    if (tabId === 'help') msg = helpGreeting;
    else if (tabId === 'sim') msg = simGreeting;
    else msg = greetings[settings.mood] || greetings.normal;

    appendMessage(tabId, 'ai', msg, false);
}

function renderMessages(tabId, messages) {
    const container = $(`#pw_msgs_${tabId}`);
    if (!container.length) return;
    container.empty();
    if (!messages || messages.length === 0) {
        addGreetingMessage(tabId);
        return;
    }
    messages.forEach(msg => appendMessage(tabId, msg.role, msg.content, false));
}

function appendMessage(tabId, role, text, save = true) {
    const container = $(`#pw_msgs_${tabId}`);
    if (!container.length) return;

    const formatted = escapeHtml(text).replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
    const isUser = role === 'user';
    const row = $(`
        <div class="pw_msg_row ${isUser ? 'user' : ''}">
            <div class="pw_avatar ${isUser ? 'user' : ''}">${isUser ? '나' : '🍑'}</div>
            <div class="pw_bubble ${isUser ? 'user' : ''}">${formatted}</div>
        </div>
    `);
    container.append(row);
    container[0].scrollTop = container[0].scrollHeight;

    if (save) {
        if (!tabHistories[tabId]) tabHistories[tabId] = [];
        tabHistories[tabId].push({ role, content: text });
        saveHistory(tabId, tabHistories[tabId]);
    }
}

function appendLoading(tabId) {
    const container = $(`#pw_msgs_${tabId}`);
    const row = $(`
        <div class="pw_msg_row" id="pw_loading_${tabId}">
            <div class="pw_avatar">🍑</div>
            <div class="pw_bubble"><div class="pw_loading"><span></span><span></span><span></span></div></div>
        </div>
    `);
    container.append(row);
    container[0].scrollTop = container[0].scrollHeight;
}

function removeLoading(tabId) { $(`#pw_loading_${tabId}`).remove(); }

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== 전송 =====

async function handleSend(tabId) {
    if (isGenerating) return;
    const input = $(`#pw_input_${tabId}`);
    const text = input.val().trim();
    if (!text) return;

    input.val('');
    appendMessage(tabId, 'user', text);
    appendLoading(tabId);
    isGenerating = true;
    $(`.pw_send_btn[data-tabid="${tabId}"]`).prop('disabled', true);

    try {
        const response = await generateResponse(tabId, text);
        removeLoading(tabId);
        appendMessage(tabId, 'ai', response);
    } catch (err) {
        removeLoading(tabId);
        appendMessage(tabId, 'ai', '오류가 발생했습니다. 다시 시도해주세요.', false);
        console.error(`[${EXTENSION_NAME}] 오류:`, err);
    } finally {
        isGenerating = false;
        $(`.pw_send_btn[data-tabid="${tabId}"]`).prop('disabled', false);
        input.focus();
    }
}

// ===== AI 응답 =====

async function generateResponse(tabId, userMessage) {
    const tabSettings = getTabSettings(tabId);
    const contextText = buildContextText(tabSettings.contextMessages);
    const systemPrompt = buildSystemPrompt(tabId, contextText);
    const history = (tabHistories[tabId] || []).slice(-20);

    if (settings.source === 'main') {
        const { generateRaw } = globalContext;
        if (!generateRaw) throw new Error('generateRaw 사용 불가');
        const result = await generateRaw({
            systemPrompt,
            prompt: userMessage,
            streaming: false,
        });
        return result || '응답을 받지 못했습니다.';
    } else {
        if (!settings.profileId) throw new Error('Connection Profile을 선택해주세요.');
        const messages = [{ role: 'system', content: systemPrompt }, ...history];
        const response = await globalContext.ConnectionManagerRequestService.sendRequest(
            settings.profileId, messages, tabSettings.maxTokens,
            { stream: false, extractData: true, includePreset: false, includeInstruct: false }
        );
        if (typeof response === 'string') return response;
        if (response?.choices?.[0]?.message?.content) return response.choices[0].message.content;
        return response?.content || response?.message || '응답을 받지 못했습니다.';
    }
}

function buildSystemPrompt(tabId, contextText) {
    if (tabId === 'help') {
        return `${HELP_SYSTEM_PROMPT}\n\n===== 현재 채팅 컨텍스트 =====\n${contextText}\n===========================`;
    }
    if (tabId === 'sim') {
        const simPrompt = $('#pw_sim_prompt').val() || '';
        return `너는 아래 시뮬레이션 지시를 정확히 수행하는 어시스턴트다.
말투나 분석 없이 오직 지시한 형식과 내용에만 집중해서 답한다.

===== 시뮬레이션 지시 =====
${simPrompt}
===========================

===== 현재 채팅 컨텍스트 =====
${contextText}
===========================`;
    }

    const moodPrompt = MOOD_PROMPTS[settings.mood] || MOOD_PROMPTS.normal;
    return `${moodPrompt}

너는 현재 SillyTavern 채팅 세션의 OOC 어시스턴트야.
반드시 아래 규칙을 따라:
1. 오직 현재 채팅과 관련된 질문에만 답한다.
2. 채팅과 무관한 질문은 정중히 거절한다.
3. 답변 시 문단을 나눠서 읽기 쉽게 작성한다.
4. 아래 제공된 모든 컨텍스트를 활용해서 답한다.
5. 설정된 말투를 반드시 유지한다.

===== 현재 채팅 컨텍스트 =====
${contextText}
===========================`;
}

function buildContextText(maxMessages = 10) {
    const ctx = SillyTavern.getContext();
    let text = '';

    // 페르소나
    try {
        const { user_avatar } = globalContext;
        const { power_user } = globalContext;
        if (user_avatar && power_user) {
            const personaName = power_user.personas?.[user_avatar] || power_user.name || 'User';
            text += `=== 페르소나 ===\n이름: ${personaName}\n`;
            const desc = power_user.persona_descriptions?.[user_avatar]?.description || power_user.persona_description || '';
            if (desc) text += `설명: ${desc}\n`;
            text += '\n';
        }
    } catch (e) {}

    // 캐릭터 카드
    const charId = ctx.characterId;
    const char = ctx.characters?.[charId];
    if (char) {
        text += `=== 캐릭터 카드 ===\n`;
        text += `이름: ${char.name || '알 수 없음'}\n`;
        const data = char.data || char;
        if (data.description) text += `\n[설명]\n${data.description}\n`;
        if (data.personality) text += `\n[성격]\n${data.personality}\n`;
        if (data.scenario) text += `\n[시나리오]\n${data.scenario}\n`;
        if (data.system_prompt) text += `\n[시스템 프롬프트]\n${data.system_prompt}\n`;
        if (data.post_history_instructions) text += `\n[Post History]\n${data.post_history_instructions}\n`;
        if (data.creator_notes) text += `\n[제작자 노트]\n${data.creator_notes}\n`;
        if (data.character_book?.entries) {
            const entries = Object.values(data.character_book.entries).filter(e => e.content);
            if (entries.length) {
                text += `\n[캐릭터 로어북]\n`;
                entries.forEach(e => { text += `- ${e.content}\n`; });
            }
        }
        text += '\n';
    }

    // 작가 노트
    const authorNote = ctx.chatMetadata?.note_prompt || '';
    if (authorNote) text += `=== 작가 노트 ===\n${authorNote}\n\n`;

    // 프롬프트 오더
    try {
        const promptOrder = ctx.getCurrentCharacter?.()?.data?.post_history_instructions;
        if (promptOrder) text += `=== 프롬프트 오더 ===\n${promptOrder}\n\n`;
    } catch (e) {}

    // 채팅 로그
    const chat = ctx.chat || [];
    const startIdx = Math.max(0, chat.length - maxMessages);
    const recentChat = chat.slice(startIdx);
    if (recentChat.length) {
        text += `=== 최근 채팅 (${recentChat.length}개) ===\n`;
        recentChat.forEach(msg => {
            const name = msg.is_user ? (msg.name || 'User') : (msg.name || 'Character');
            const content = msg.extra?.display_text ?? msg.mes ?? '';
            text += `${name}: ${content}\n\n`;
        });
    }

    return text.trim();
}

// ===== 이벤트 =====

function initEventListeners() {
    globalContext.eventSource.on(event_types.CHAT_CHANGED, async () => {
        currentChatId = globalContext.getCurrentChatId?.() || 'default';
        tabHistories = {};
        settings.tabs.forEach(tab => { tabHistories[tab.id] = []; });
        await restoreHistories();
    });
}

// ===== 초기화 =====

jQuery(async () => {
    const context = SillyTavern.getContext();
    context.eventSource.on(event_types.APP_READY, async () => { await init(); });
});
