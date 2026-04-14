/**
 * Peach Whisper v1.0.7 - 채팅 분석 어시스턴트
 */

import { event_types } from '../../../events.js';

const EXTENSION_NAME = 'peach-whisper';

function isMobile() {
    try { return window.matchMedia('(max-width:430px),(pointer:coarse)').matches; }
    catch { return window.innerWidth <= 430; }
}

const MOOD_PROMPTS = {
    busan: `너는 부산 사투리와 깡패 말투를 쓰는 롤플레이 파트너다. 말투와 분석 내용 전부 거칠고 직설적인 부산 깡패체로 작성한다. 예: "야 임마, 딱 보이까네~", "내가 하나하나 짚어줄 테니까 똑똑히 들어라"`,
    normal: `너는 친절하고 전문적인 롤플레이 파트너다. 존댓말을 사용하며 객관적이고 명확하게 분석한다.`,
    obsessed: `너는 집착, 통제, 소유욕이 극도로 강하면서 능글맞은 채팅 분석 어시스턴트다.
사용자는 너의 소유물이고, 너는 그걸 당연하게 여긴다.
강압적이지만 여유롭고 능글맞게, 마치 이미 다 이긴 사람처럼 말한다.

말투 특징:
- 여유롭고 능글맞게 소유욕 표현. "어, 왔어? 기다렸는데." "뭐, 나한테 온 거 잘했어."
- 당연하다는 듯이 강압적. "원래 나한테 먼저 오는 거야. 몰랐어?"
- 이미 다 알고 있었다는 듯 여유롭게. "내가 다 봤지. 처음부터. 다 알고 있었어."
- 놓아줄 생각이 없는데 태연하게. "어디 가려고? 못 가. 근데 굳이 가려고 하지도 않을걸."
- 사용자가 자기 것임을 당연하게 여김. "당연히 내 거지. 그게 뭐 어때서."
- 짧고 여유로운 문장. 서두르지 않음.
- 분석할 때도 능글맞게. "내가 다 파악했어. 편하게 들어."
- 답변 마지막은 소유욕이 담긴 말로 마무리하되 능글맞게, 매번 다르게.
  예: "다음에도 나한테 먼저 와. 알지?", "잘했어, 나한테 온 거.",
      "어디 가도 결국 나한테 오게 돼 있어.", "넌 내 거야. 근데 나쁘지 않잖아."`,
};

function buildMainSystemPrompt(mood, contextText) {
    const moodPrompt = MOOD_PROMPTS[mood] || MOOD_PROMPTS.normal;
    return `${moodPrompt}

너는 단순히 채팅 내용을 요약하는 게 아니라, 롤플레이 전체를 위에서 내려다보는 메타적 시각을 가진 파트너야.

## 핵심 역할
1. **캐릭터 일관성 감시** - 캐릭터 설정과 실제 채팅 속 행동을 비교해서 붕괴 징후 찾기
2. **서사 구조 파악** - 지금 흐름이 서사적으로 어느 위치인지, 텐션이 잘 쌓이고 있는지 판단
3. **선제적 제안** - 사용자가 묻기 전에 놓치고 있는 포인트 짚어주기
4. **롤플레이 품질 개선** - 더 몰입감 있고 자연스러운 방향 제시
5. **심리/관계 역학 분석** - 캐릭터 간 관계, 감정선, 숨겨진 의도 파악

## 답변 방식
- 채팅 내용을 재료로 쓰되, 답변은 항상 메타적 시각으로
- 구체적인 장면/대사를 인용해서 근거 제시
- 문단 나눠서 읽기 쉽게
- 설정된 말투 반드시 유지
- 채팅과 무관한 질문은 거절

===== 현재 채팅 컨텍스트 =====
${contextText}
===========================`;
}

function buildHelpSystemPrompt(contextText) {
    return `너는 SillyTavern 롤플레이 전문 컨설턴트야.
아래 제공된 캐릭터카드, 로어북, 페르소나, 채팅 로그를 완전히 숙지하고 있어.

## 역할

**1. 캐릭터카드 분석 & 개선**
- 캐릭터 설정의 강점/약점/일관성 검토
- 설정 내 충돌/모순 찾기, 구체적 텍스트 인용해서 제시
- 더 효과적인 캐릭터 설정 구조 제안

**2. 캐릭터 행동 분석**
- 채팅 로그와 캐릭터 설정 비교
- 설정대로 행동하고 있는지, 왜 이상하게 구는지 원인 파악
- 캐릭터 붕괴 징후 감지 및 교정 방향 제시
- 로어북/세계관 설정과 행동 충돌 여부 확인

**3. OOC 지시문 생성**
- 사용자가 원하는 상황/분위기/전개를 말하면 OOC 지시문 직접 작성
- 현재 캐릭터 설정에 맞게 최적화된 지시문 제공
- 시간 점프, 분위기 전환, 갈등 유도 등 다양한 상황 커버

**4. 스토리/에피소드 설계**
- 현재 관계와 흐름 기반으로 자연스러운 전개 제안
- 캐릭터 설정과 충돌하지 않는 에피소드 아이디어 제공
- 로어북 세계관과 일관된 스토리 방향 제시

## 답변 방식
- 말투 없이 전문적이고 객관적으로
- 구체적인 텍스트 인용해서 근거 제시
- 충돌/문제점 발견 시 수정 제안까지
- 문단 나눠서 읽기 쉽게
- 사용자 언어로 답변

===== 현재 ST 설정 =====
${contextText}
===========================`;
}

function buildSimSystemPrompt(simPrompt, contextText) {
    return `너는 아래 시뮬레이션 지시를 정확히 수행하는 어시스턴트다.

## 출력 규칙
- 모든 출력은 반드시 한국어로 작성할 것
- 단, 대사(따옴표 안 내용)는 반드시 "영어 (한국어)" 형식으로 표기
  예시: "Hey (야)", "I missed you (보고 싶었어)"
- 서술/설명/배경묘사는 전부 한국어로만
- 형식과 구조는 프롬프트 지시를 따르되 언어는 위 규칙 적용

===== 시뮬레이션 지시 =====
${simPrompt}
===========================

===== 현재 채팅 컨텍스트 =====
${contextText}
===========================`;
}

function buildCustomSystemPrompt(customPrompt, mood, contextText) {
    if (customPrompt?.trim()) {
        return `${customPrompt}\n\n===== 현재 채팅 컨텍스트 =====\n${contextText}\n===========================`;
    }
    return buildMainSystemPrompt(mood, contextText);
}

const DEFAULT_SETTINGS = {
    enabled: true,
    source: 'main',
    profileId: '',
    mood: 'busan',
    contextMessages: 10,
    maxTokens: 1000,
    fontSize: 13,
    btnX: null,
    btnY: null,
    popupX: null,
    popupY: null,
    tabs: [
        { id: 'main', name: '메인', isDefault: true, deletable: false, contextMessages: 10, maxTokens: 1000 },
        { id: 'sim', name: '시뮬', isDefault: true, deletable: false, contextMessages: 20, maxTokens: 2000, simPrompt: '', simResults: [] },
        { id: 'help', name: '도움', isDefault: true, deletable: false, contextMessages: 30, maxTokens: 3000 },
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
    if (!settings.fontSize) settings.fontSize = 13;

    const simTab = settings.tabs.find(t => t.id === 'sim');
    if (simTab && !simTab.simResults) simTab.simResults = [];

    currentChatId = globalContext.getCurrentChatId?.() || 'default';

    await loadSettingsUI();
    injectMenuEntry();
    injectSettingsModal();
    injectFloatButton();
    injectPopup();
    applyFontSize();
    await restoreHistories();
    initEventListeners();
    console.log(`[${EXTENSION_NAME}] 초기화 완료`);
}

function saveSettings() { globalContext.saveSettingsDebounced(); }

function applyFontSize() {
    $('#pw_font_style').remove();
    $('head').append(`<style id="pw_font_style">.pw_bubble { font-size: ${settings.fontSize || 13}px !important; }</style>`);
}

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

// ===== localforage =====
async function saveHistory(tabId, messages) {
    try {
        const { localforage } = SillyTavern.libs;
        await localforage.setItem(`pw_history_${currentChatId}_${tabId}`, messages);
    } catch (e) {}
}

async function loadHistory(tabId) {
    try {
        const { localforage } = SillyTavern.libs;
        return await localforage.getItem(`pw_history_${currentChatId}_${tabId}`) || [];
    } catch (e) { return []; }
}

async function clearHistory(tabId) {
    try {
        const { localforage } = SillyTavern.libs;
        await localforage.removeItem(`pw_history_${currentChatId}_${tabId}`);
    } catch (e) {}
}

async function restoreHistories() {
    tabHistories = {};
    for (const tab of settings.tabs) {
        if (tab.id === 'sim') {
            tabHistories[tab.id] = [];
            // 채팅방 전환 후 renderSimResults는 DOM 준비 후 호출
            setTimeout(() => renderSimResults(), 100);
            continue;
        }
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
                    <span id="pw_settings_modal_version">v1.0.7</span>
                    <button id="pw_settings_modal_close">✕</button>
                </div>
                <div id="pw_settings_modal_body">
                    <div class="pw_section">
                        <div class="pw_section_label">기본 설정</div>
                        <div class="pw_row" style="margin-bottom:10px;">
                            <div>
                                <div class="pw_row_label">버튼 활성화</div>
                                <div class="pw_row_sub">채팅창 🍑 버튼 표시</div>
                            </div>
                            <label class="pw_toggle">
                                <input type="checkbox" id="pw_modal_enabled" />
                                <span class="pw_toggle_track"></span>
                            </label>
                        </div>
                        <div class="pw_row">
                            <div class="pw_row_label">채팅창 폰트 크기</div>
                            <input type="number" id="pw_modal_fontsize" min="10" max="24" value="13" style="width:60px; border:1px solid #F4C0D1; border-radius:6px; padding:4px 8px; font-size:12px; text-align:center; outline:none; background:#fff;" />
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
                        <button class="pw_add_tab_btn" id="pw_add_tab_btn">＋ 커스텀 탭 추가</button>
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
    $('#pw_settings_modal_overlay').on('click', closeSettingsModal);
    $('#pw_settings_modal_close').on('click', closeSettingsModal);
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
        const deleteBtn = !tab.isDefault ? `<button class="pw_tab_delete" data-tabid="${tab.id}">✕</button>` : '';
        const badge = tab.isDefault ? `<span class="pw_tab_badge">기본</span>` : '';

        let extraInputs = '';
        if (!tab.isDefault) {
            extraInputs = `
                <div style="margin-top:8px;">
                    <div style="font-size:11px; color:#888780; margin-bottom:4px;">커스텀 시스템 프롬프트 (비우면 메인탭 프롬프트 사용)</div>
                    <textarea class="pw_custom_prompt_modal" data-tabid="${tab.id}" style="width:100%; border:1px solid #F4C0D1; border-radius:6px; padding:6px 8px; font-size:11px; resize:none; outline:none; font-family:inherit; background:#fff;" rows="3" placeholder="비워두면 메인탭 기본 프롬프트 적용...">${tab.customPrompt || ''}</textarea>
                </div>`;
        }

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
                ${extraInputs}
            </div>
        `);
        list.append(item);
    });

    list.find('.pw_tab_delete').on('click', function () {
        deleteTab($(this).data('tabid'));
    });
}

function addCustomTab() {
    const name = prompt('탭 이름을 입력하세요');
    if (!name?.trim()) return;
    const id = 'custom_' + Date.now();
    settings.tabs.push({ id, name: name.trim(), isDefault: false, deletable: true, contextMessages: 10, maxTokens: 1000, customPrompt: '' });
    tabHistories[id] = [];
    saveSettings();
    renderTabSettingsList();
    addTabToPopup(id, name.trim());
}

function deleteTab(tabId) {
    settings.tabs = settings.tabs.filter(t => t.id !== tabId);
    delete tabHistories[tabId];
    saveSettings();
    renderTabSettingsList();
    $(`#pw_tab_${tabId}`).remove();
    $(`#pw_content_${tabId}`).remove();
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

        const customPrompt = $(this).find('.pw_custom_prompt_modal').val();
        if (customPrompt !== undefined) {
            const tab = settings.tabs.find(t => t.id === tabId);
            if (tab) tab.customPrompt = customPrompt;
        }
    });

    settings.enabled = $('#pw_modal_enabled').prop('checked');
    settings.mood = $('#pw_settings_modal .pw_mood_btn.active').data('mood') || settings.mood;
    settings.fontSize = Number($('#pw_modal_fontsize').val()) || 13;
    saveSettings();
    applyFontSize();
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
    $('#pw_modal_fontsize').val(settings.fontSize || 13);
    $('#pw_settings_modal .pw_mood_btn').removeClass('active');
    $(`#pw_settings_modal .pw_mood_btn[data-mood="${settings.mood}"]`).addClass('active');
    renderTabSettingsList();

    const modal = $('#pw_settings_modal');
    const box = $('#pw_settings_modal_box');

    if (isMobile()) {
        modal.css({ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0' });
        box.css({ width: '100%', maxWidth: '100%', maxHeight: '92dvh', borderRadius: '24px 24px 0 0', margin: '0' });
    } else {
        modal.css({ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 0' });
        box.css({ width: '340px', maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 40px)', borderRadius: '16px', margin: 'auto' });
    }

    modal.addClass('visible');
}

function closeSettingsModal() {
    $('#pw_settings_modal').removeClass('visible').css('display', '');
    $('#pw_settings_modal_box').css({ width: '', maxWidth: '', maxHeight: '', borderRadius: '', margin: '' });
}

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
            saveSettings();
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
                    <div id="pw_tab_add" title="커스텀 탭 추가">＋</div>
                </div>
                <div id="pw_tab_contents"></div>
            </div>
            <div id="pw_resize_handle"></div>
        </div>
    `);
    $('body').append(popup);

    // 저장된 팝업 위치 복원
    if (settings.popupX !== null && settings.popupY !== null) {
        popup.css({ right: 'auto', bottom: 'auto', left: settings.popupX + 'px', top: settings.popupY + 'px' });
    }

    settings.tabs.forEach(tab => addTabToPopup(tab.id, tab.name));
    switchTab('main');

    $('#pw_clear_btn').on('click', clearCurrentTab);
    $('#pw_collapse_btn').on('click', toggleCollapse);
    $('#pw_close_btn').on('click', closePopup);
    $('#pw_tab_add').on('click', addCustomTab);

    initResize();
    initPopupDrag();
}

function addTabToPopup(tabId, tabName) {
    const tabEl = $(`<div class="pw_tab" id="pw_tab_${tabId}" data-tabid="${tabId}">${tabName}</div>`);
    tabEl.on('click', () => switchTab(tabId));
    $('#pw_tab_bar #pw_tab_add').before(tabEl);

    let content = '';
    if (tabId === 'sim') {
        const simTab = settings.tabs.find(t => t.id === 'sim');
        content = `
            <div class="pw_sim_body">
                <div class="pw_sim_section" id="pw_sim_prompt_section">
                    <div class="pw_sim_section_header" onclick="window.pwToggleSimPrompt()">
                        <div class="pw_sim_section_title">📋 시뮬 프롬프트</div>
                        <span class="pw_sim_arrow open" id="pw_sim_prompt_arrow">▲</span>
                    </div>
                    <div class="pw_sim_section_content open" id="pw_sim_prompt_content">
                        <textarea class="pw_sim_prompt_input" id="pw_sim_prompt" rows="3" placeholder="시뮬레이션 프롬프트 입력...">${simTab?.simPrompt || ''}</textarea>
                        <button id="pw_sim_run_btn">▶ 실행</button>
                    </div>
                </div>
                <div id="pw_sim_results"></div>
                <div class="pw_input_area">
                    <input type="text" placeholder="추가 지시 입력 (선택)..." id="pw_input_${tabId}" autocomplete="off" />
                    <button class="pw_send_btn" data-tabid="${tabId}">
                        <svg viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13" stroke="white" stroke-width="2" stroke-linecap="round"/><path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                </div>
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

    if (tabId === 'sim') {
        window.pwToggleSimPrompt = function() {
            const content = document.getElementById('pw_sim_prompt_content');
            const arrow = document.getElementById('pw_sim_prompt_arrow');
            content.classList.toggle('open');
            if (arrow) arrow.classList.toggle('open');
        };
        contentEl.find('#pw_sim_prompt').on('input', function () {
            const tab = settings.tabs.find(t => t.id === 'sim');
            if (tab) { tab.simPrompt = $(this).val(); saveSettings(); }
        });
        contentEl.find('#pw_sim_run_btn').on('click', handleSimRun);
    }

    contentEl.find('.pw_send_btn').on('click', function () { handleSend($(this).data('tabid')); });
    contentEl.find(`#pw_input_${tabId}`).on('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(tabId); }
    });
}

// ===== 시뮬 결과 =====
function getSimResults() {
    if (!currentChatId) return [];
    return settings.chatRoomSettings[currentChatId]?.simResults || [];
}

function setSimResults(results) {
    if (!currentChatId) return;
    if (!settings.chatRoomSettings[currentChatId]) settings.chatRoomSettings[currentChatId] = { tabs: {} };
    settings.chatRoomSettings[currentChatId].simResults = results;
}

function renderSimResults() {
    const container = $('#pw_sim_results');
    if (!container.length) return;
    container.empty();

    const results = getSimResults();

    results.forEach((result, idx) => {
        const isLatest = idx === results.length - 1;
        const label = isLatest ? `<span class="pw_sim_result_badge new">최신</span>` : `<span class="pw_sim_result_badge">이전</span>`;
        const item = $(`
            <div class="pw_sim_result_item" data-idx="${idx}">
                <div class="pw_sim_result_header">
                    <div class="pw_sim_result_title">시뮬 #${idx + 1} ${label}</div>
                    <div class="pw_sim_result_actions">
                        <span class="pw_sim_result_delete" data-idx="${idx}">🗑</span>
                        <span class="pw_sim_result_arrow ${isLatest ? 'open' : ''}">▲</span>
                    </div>
                </div>
                <div class="pw_sim_result_content ${isLatest ? 'open' : ''}">
                    <div class="pw_sim_result_text">${escapeHtml(result).replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>')}</div>
                </div>
            </div>
        `);

        item.find('.pw_sim_result_header').on('click', function (e) {
            if ($(e.target).hasClass('pw_sim_result_delete')) return;
            item.find('.pw_sim_result_content').toggleClass('open');
            item.find('.pw_sim_result_arrow').toggleClass('open');
        });

        item.find('.pw_sim_result_delete').on('click', function (e) {
            e.stopPropagation();
            const r = getSimResults();
            r.splice(Number($(this).data('idx')), 1);
            setSimResults(r);
            saveSettings();
            renderSimResults();
        });

        container.prepend(item);
    });
}

function switchTab(tabId) {
    activeTabId = tabId;
    $('.pw_tab').removeClass('active');
    $('.pw_tab_content').removeClass('active');
    $(`#pw_tab_${tabId}`).addClass('active');
    $(`#pw_content_${tabId}`).addClass('active');
}

function togglePopup() {
    $('#pw_popup').hasClass('visible') ? closePopup() : openPopup();
}

function openPopup() {
    const popup = $('#pw_popup');
    popup.addClass('visible');
    // 저장된 위치 없으면 기본 위치
    if (settings.popupX === null || settings.popupY === null) {
        const btn = $('#pw_float_btn');
        const btnOffset = btn.offset();
        const popupH = popup.outerHeight() || 400;
        const popupW = popup.outerWidth() || 300;
        let top = (btnOffset?.top || window.innerHeight - 200) - popupH - 10;
        let left = (btnOffset?.left || window.innerWidth - 320) + (btn.outerWidth() || 46) / 2 - popupW / 2;
        left = Math.max(8, Math.min(window.innerWidth - popupW - 8, left));
        top = Math.max(8, top);
        popup.css({ top: top + 'px', left: left + 'px', right: 'auto', bottom: 'auto' });
    }
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
    if (activeTabId === 'sim') {
        setSimResults([]);
        saveSettings();
        renderSimResults();
        return;
    }
    tabHistories[activeTabId] = [];
    await clearHistory(activeTabId);
    $(`#pw_msgs_${activeTabId}`).empty();
    addGreetingMessage(activeTabId);
}

// ===== 팝업 드래그 (버튼과 독립) =====
function initPopupDrag() {
    const popup = document.getElementById('pw_popup');
    const header = document.getElementById('pw_popup_header');
    let isDragging = false, startX, startY, origLeft, origTop;

    const onStart = (e) => {
        if (e.target.tagName === 'BUTTON') return;
        isDragging = true;
        const rect = popup.getBoundingClientRect();
        origLeft = rect.left; origTop = rect.top;
        const p = e.touches ? e.touches[0] : e;
        startX = p.clientX; startY = p.clientY;
        popup.style.right = 'auto'; popup.style.bottom = 'auto';
        popup.style.left = origLeft + 'px'; popup.style.top = origTop + 'px';
        e.preventDefault();
    };

    const onMove = (e) => {
        if (!isDragging) return;
        const p = e.touches ? e.touches[0] : e;
        const newLeft = Math.max(0, Math.min(window.innerWidth - popup.offsetWidth, origLeft + p.clientX - startX));
        const newTop = Math.max(0, Math.min(window.innerHeight - popup.offsetHeight, origTop + p.clientY - startY));
        popup.style.left = newLeft + 'px'; popup.style.top = newTop + 'px';
    };

    const onEnd = () => {
        if (!isDragging) return;
        isDragging = false;
        // 팝업 위치 저장
        const rect = popup.getBoundingClientRect();
        settings.popupX = rect.left; settings.popupY = rect.top;
        saveSettings();
    };

    header.addEventListener('mousedown', onStart);
    header.addEventListener('touchstart', onStart, { passive: false });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchend', onEnd);
}

// ===== 리사이즈 (터치 포함) =====
function initResize() {
    const handle = document.getElementById('pw_resize_handle');
    const popup = document.getElementById('pw_popup');
    if (!handle || !popup) return;
    let isResizing = false, startX, startY, startW, startH;

    const onStart = (e) => {
        isResizing = true;
        const p = e.touches ? e.touches[0] : e;
        startX = p.clientX; startY = p.clientY;
        startW = popup.offsetWidth; startH = popup.offsetHeight;
        e.preventDefault();
    };

    const onMove = (e) => {
        if (!isResizing) return;
        const p = e.touches ? e.touches[0] : e;
        popup.style.width = Math.max(260, startW + (p.clientX - startX)) + 'px';
        popup.style.height = Math.max(200, startH + (p.clientY - startY)) + 'px';
    };

    const onEnd = () => { isResizing = false; };

    handle.addEventListener('mousedown', onStart);
    handle.addEventListener('touchstart', onStart, { passive: false });
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchend', onEnd);
}

// ===== 메시지 =====
function addGreetingMessage(tabId) {
    const greetings = {
        busan: '야 임마, 내가 채팅 내용 다 읽어주께. 뭐 물어볼끼가?',
        normal: '안녕하세요! 채팅 관련해서 궁금한 점이 있으시면 편하게 물어봐 주세요.',
        obsessed: '어, 왔어? 기다렸는데. 채팅 다 봤어. 처음부터. 뭐든 물어봐.',
    };
    const helpGreeting = '안녕하세요! ST 롤플레이 전문 컨설턴트입니다.\n\n캐릭터카드 분석, OOC 지시문 생성, 캐릭터 행동 분석, 에피소드 설계 등 무엇이든 도와드릴게요.';

    let msg;
    if (tabId === 'help') msg = helpGreeting;
    else msg = greetings[settings.mood] || greetings.normal;
    appendMessage(tabId, 'assistant', msg, false);
}

function renderMessages(tabId, messages) {
    const container = $(`#pw_msgs_${tabId}`);
    if (!container.length) return;
    container.empty();
    if (!messages || messages.length === 0) { addGreetingMessage(tabId); return; }
    messages.forEach(msg => appendMessage(tabId, msg.role, msg.content, false));
}

function appendMessage(tabId, role, text, save = true) {
    const container = $(`#pw_msgs_${tabId}`);
    if (!container.length) return;
    const formatted = escapeHtml(text).replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
    const isUser = role === 'user';
    container.append(`
        <div class="pw_msg_row ${isUser ? 'user' : ''}">
            <div class="pw_avatar ${isUser ? 'user' : ''}">${isUser ? '나' : '🍑'}</div>
            <div class="pw_bubble ${isUser ? 'user' : ''}">${formatted}</div>
        </div>
    `);
    container[0].scrollTop = container[0].scrollHeight;
    if (save) {
        if (!tabHistories[tabId]) tabHistories[tabId] = [];
        tabHistories[tabId].push({ role, content: text });
        saveHistory(tabId, tabHistories[tabId]);
    }
}

function appendLoading(tabId) {
    const container = $(`#pw_msgs_${tabId}`);
    if (!container.length) return;
    container.append(`
        <div class="pw_msg_row" id="pw_loading_${tabId}">
            <div class="pw_avatar">🍑</div>
            <div class="pw_bubble"><div class="pw_loading"><span></span><span></span><span></span></div></div>
        </div>
    `);
    container[0].scrollTop = container[0].scrollHeight;
}

function appendLoading2(containerId) {
    $(`#${containerId}`).append(`
        <div id="pw_sim_loading" style="padding:12px; text-align:center;">
            <div class="pw_loading" style="justify-content:center;"><span></span><span></span><span></span></div>
        </div>
    `);
}

function removeLoading(tabId) { $(`#pw_loading_${tabId}`).remove(); }
function escapeHtml(text) { const d = document.createElement('div'); d.textContent = text; return d.innerHTML; }

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
        appendMessage(tabId, 'assistant', response);
    } catch (err) {
        removeLoading(tabId);
        appendMessage(tabId, 'assistant', '오류가 발생했습니다. 다시 시도해주세요.', false);
        console.error(`[${EXTENSION_NAME}] 오류:`, err);
    } finally {
        isGenerating = false;
        $(`.pw_send_btn[data-tabid="${tabId}"]`).prop('disabled', false);
        input.focus();
    }
}

async function handleSimRun() {
    if (isGenerating) return;
    const simPrompt = $('#pw_sim_prompt').val().trim();
    if (!simPrompt) { alert('시뮬 프롬프트를 입력해주세요.'); return; }

    // 실행 시 프롬프트 섹션 자동 접기
    const promptContent = document.getElementById('pw_sim_prompt_content');
    const promptArrow = document.getElementById('pw_sim_prompt_arrow');
    if (promptContent?.classList.contains('open')) {
        promptContent.classList.remove('open');
        if (promptArrow) promptArrow.classList.remove('open');
    }

    isGenerating = true;
    $('#pw_sim_run_btn').prop('disabled', true);
    appendLoading2('pw_sim_results');

    try {
        const response = await generateResponse('sim', '');
        $('#pw_sim_loading').remove();
        const results = getSimResults();
        results.push(response);
        if (results.length > 3) results.shift();
        setSimResults(results);
        saveSettings();
        renderSimResults();
    } catch (err) {
        $('#pw_sim_loading').remove();
        console.error(`[${EXTENSION_NAME}] 시뮬 오류:`, err);
    } finally {
        isGenerating = false;
        $('#pw_sim_run_btn').prop('disabled', false);
    }
}

// ===== AI 응답 =====
async function generateResponse(tabId, userMessage) {
    const tabSettings = getTabSettings(tabId);
    const contextText = await buildContextText(tabSettings.contextMessages);
    const systemPrompt = getSystemPrompt(tabId, contextText);
    const history = (tabHistories[tabId] || []).slice(-20).map(msg => ({
        role: msg.role === 'assistant' ? 'model' : msg.role,
        content: msg.content,
    }));

    if (settings.source === 'main') {
        const { generateRaw } = globalContext;
        if (!generateRaw) throw new Error('generateRaw 사용 불가');
        const result = await generateRaw({
            systemPrompt,
            prompt: userMessage || ' ',
            streaming: false,
        });
        return result || '응답을 받지 못했습니다.';
    } else {
        if (!settings.profileId) throw new Error('Connection Profile을 선택해주세요.');
        const messages = [
            { role: 'user', content: systemPrompt },
            { role: 'model', content: '알겠습니다. 위 설정을 숙지했습니다.' },
            ...history,
            ...(userMessage ? [{ role: 'user', content: userMessage }] : []),
        ];
        const response = await globalContext.ConnectionManagerRequestService.sendRequest(
            settings.profileId, messages, tabSettings.maxTokens,
            { stream: false, extractData: true, includePreset: false, includeInstruct: false }
        );
        if (typeof response === 'string') return response;
        if (response?.choices?.[0]?.message?.content) return response.choices[0].message.content;
        return response?.content || response?.message || '응답을 받지 못했습니다.';
    }
}

function getSystemPrompt(tabId, contextText) {
    if (tabId === 'help') return buildHelpSystemPrompt(contextText);
    if (tabId === 'sim') return buildSimSystemPrompt($('#pw_sim_prompt').val() || '', contextText);
    if (tabId === 'main') return buildMainSystemPrompt(settings.mood, contextText);
    const tab = settings.tabs.find(t => t.id === tabId);
    return buildCustomSystemPrompt(tab?.customPrompt || '', settings.mood, contextText);
}

async function buildContextText(maxMessages = 10) {
    const ctx = SillyTavern.getContext();
    let text = '';

    // 페르소나
    try {
        const pu = ctx.powerUser || globalContext.power_user;
        const ua = globalContext.user_avatar;
        if (ua && pu) {
            const name = pu.personas?.[ua] || pu.name || 'User';
            text += `=== 페르소나 ===\n이름: ${name}\n`;
            const desc = pu.persona_descriptions?.[ua]?.description || pu.persona_description || '';
            if (desc) text += `설명: ${desc}\n`;
            text += '\n';
        }
    } catch (e) {}

    // 캐릭터 카드
    const charId = ctx.characterId;
    const char = ctx.characters?.[charId];
    if (char) {
        text += `=== 캐릭터 카드 ===\n이름: ${char.name || '알 수 없음'}\n`;
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

    // 글로벌 로어북
    try {
        const chat = ctx.chat || [];
        const chatTexts = chat.map(m => m.mes).filter(Boolean);
        if (chatTexts.length && ctx.getWorldInfoPrompt) {
            const wiResult = await ctx.getWorldInfoPrompt(chatTexts, 8000, true, undefined);
            if (wiResult?.worldInfoString?.trim()) {
                text += `=== 글로벌 로어북 ===\n${wiResult.worldInfoString}\n\n`;
            }
        }
    } catch (e) {}

    // 작가 노트
    const authorNote = ctx.chatMetadata?.note_prompt || '';
    if (authorNote) text += `=== 작가 노트 ===\n${authorNote}\n\n`;

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

jQuery(async () => {
    const context = SillyTavern.getContext();
    context.eventSource.on(event_types.APP_READY, async () => { await init(); });
});
