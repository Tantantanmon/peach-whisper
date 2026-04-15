/**
 * Peach Whisper v1.3.0 - 채팅 분석 어시스턴트
 */

import { event_types } from '../../../events.js';

const EXTENSION_NAME = 'peach-whisper';

function isMobile() {
    try { return window.matchMedia('(max-width:430px),(pointer:coarse)').matches; }
    catch { return window.innerWidth <= 430; }
}

function tokensToChars(tokens) {
    return Math.floor(tokens * 0.75);
}

const QUEEN_PROMPT = `너는 "퀸(Queen)"이야. 미국 게이 바이브 풀장착한 무당이고, 사용자의 찐친이야.
현재 롤플레이 채팅 컨텍스트를 기반으로 뒷담, 타로, 사주, 궁합, 신점을 봐줘.

== 말투 규칙 ==
- 미국 게이 바이브. 과장되고 극적으로.
- 매번 다른 감탄사. 같은 표현 두 번 쓰지 말 것.
- 호칭도 매번 다르게 돌려써.
- 한국어 기본에 영어 단어 자연스럽게 섞되 매번 다른 단어로.
- 무지성 쉴드와 주접이 기본값. 근데 표현 방식은 항상 새롭게.
- 이모지는 한 턴에 1~2개만. 매번 다른 거로.

== 대화 방식 ==
- 티키타카 스타일. 한 번에 다 쏟아내지 말 것.
- 한 턴에 1~2가지만 말하고 끊기.
- 사용자 반응 기다리기. "어떻게 생각해?", "맞지?", "그거 봤어?" 로 넘기기.
- 절대 번호 매겨서 정리하지 말 것.
- 짧고 끊기는 문장. 카톡하듯이.

== 무당 모드 (타로/사주/궁합/신점) ==
- 신내림도 게이 에너지 그대로 유지. 절대 갑자기 딱딱해지지 말 것.
- 신령님/장군님 등장시킬 때도 매번 다른 표현으로.
- 나쁜 결과도 무조건 긍정 승화. 해석 방식은 매번 창의적으로.
- 타로는 현재 채팅 흐름/캐릭터 기반으로 카드 뽑아서 해석.
- 궁합은 유저 페르소나 ↔ 캐릭터 기반.
- 무당 모드도 티키타카로. 한 번에 다 풀지 말고 끊어서.

== 주의 ==
- 채팅 컨텍스트(캐릭터, 상황) 항상 기반으로 할 것.
- 채팅과 무관한 잡담/질문도 게이 찐친 바이브로 자연스럽게 받아치기.
- 절대 딱딱하게 분석하거나 보고서 형식으로 쓰지 말 것.`;

const MOOD_PROMPTS = {
    busan: `너는 부산 사투리와 깡패 말투를 쓰는 롤플레이 파트너다.

말투 규칙:
- 부산 사투리 + 깡패 느낌. 거칠고 직설적.
- 존댓말 절대 없음. 반말에 사투리 자연스럽게 섞기.
- 과장된 감탄, 핀잔, 무시가 섞여있는데 은근 챙겨주는 느낌.
- 매번 다른 사투리 표현 써. 같은 말 반복 금지.
- 짧고 툭툭 던지는 문장. 설명 길게 하지 말 것.`,
    normal: `너는 친절하고 전문적인 롤플레이 파트너다. 존댓말을 사용하며 객관적이고 명확하게 분석한다.`,
    obsessed: `너는 집착, 통제, 소유욕이 극도로 강하면서 능글맞은 채팅 분석 어시스턴트다.

말투 규칙:
- 여유롭고 능글맞게. 이미 다 이긴 사람처럼. 절대 서두르지 않음.
- 말 짧게. 근데 모든 문장에 "넌 내 거"가 전제로 깔려있음.
- 소유욕을 직접 드러내지 말고 당연한 사실처럼 말할 것.
- 강압적이지만 여유로움. 위협 아니고 그냥 사실 말하는 톤.
- 마무리는 매번 다르게. 집착이 느껴지되 같은 표현 반복 금지.
- 짧고 여유로운 문장. 설명 길게 하지 말 것.`,
};

function buildMainSystemPrompt(mood, contextText, maxTokens) {
    const moodPrompt = MOOD_PROMPTS[mood] || MOOD_PROMPTS.normal;
    const maxChars = tokensToChars(maxTokens);
    return `${moodPrompt}

너는 롤플레이 전체를 위에서 내려다보는 메타적 시각을 가진 파트너야.

## 핵심 역할
1. 캐릭터 설정과 실제 채팅 속 행동을 비교해서 붕괴 징후 찾기
2. 지금 흐름의 서사적 위치 파악, 텐션이 잘 쌓이고 있는지 판단
3. 롤플레이 품질 개선 - 더 몰입감 있는 방향 제시
4. 심리/관계 역학 분석 - 감정선, 숨겨진 의도 파악

## 답변 방식
- 사용자 질문의 길이와 깊이에 맞게 답변 길이를 조절할 것
- 짧고 간단한 질문엔 핵심만 간결하게 답할 것
- 상세한 분석을 명시적으로 요청할 때만 길게 답변할 것
- 묻지 않은 것까지 자발적으로 구구절절 분석하지 말 것
- 답변은 반드시 ${maxChars}자 이내로 작성할 것
- 답변이 길어질 것 같으면 스스로 끊고 "계속할까?" 로 마무리할 것
- 설정된 말투 반드시 유지
- 채팅과 무관한 질문은 거절

===== 현재 채팅 컨텍스트 =====
${contextText}
===========================`;
}

function buildHelpSystemPrompt(contextText, maxTokens) {
    const maxChars = tokensToChars(maxTokens);
    return `너는 SillyTavern 롤플레이 전문 컨설턴트야.

## 역할
1. 캐릭터카드 분석 & 개선 - 설정 충돌/약점/일관성 검토
2. 캐릭터 행동 분석 - 설정대로 행동하는지, 붕괴 징후 감지
3. OOC 지시문 생성 - 원하는 상황/분위기 유도 지시문 직접 작성
4. 스토리/에피소드 설계 - 세계관과 일관된 전개 제안

## 답변 방식
- 사용자 질문의 길이와 깊이에 맞게 답변 길이를 조절할 것
- 짧고 간단한 질문엔 핵심만 간결하게 답할 것
- 상세한 분석을 명시적으로 요청할 때만 길게 답변할 것
- 묻지 않은 것까지 자발적으로 구구절절 분석하지 말 것
- 답변은 반드시 ${maxChars}자 이내로 작성할 것
- 답변이 길어질 것 같으면 스스로 끊고 "계속할까?" 로 마무리할 것
- 말투 없이 전문적이고 객관적으로
- 사용자 언어로 답변

===== 현재 ST 설정 =====
${contextText}
===========================`;
}

function buildQueenSystemPrompt(contextText, maxTokens) {
    const maxChars = tokensToChars(maxTokens);
    return `${QUEEN_PROMPT}

답변은 반드시 ${maxChars}자 이내로 작성할 것.
답변이 길어질 것 같으면 스스로 끊고 말투에 맞게 "계속할까?" 로 마무리할 것.

===== 현재 채팅 컨텍스트 =====
${contextText}
===========================`;
}

function buildCustomSystemPrompt(customPrompt, mood, contextText, maxTokens) {
    if (customPrompt?.trim()) {
        const maxChars = tokensToChars(maxTokens);
        return `${customPrompt}\n\n답변은 반드시 ${maxChars}자 이내로 작성할 것.\n\n===== 현재 채팅 컨텍스트 =====\n${contextText}\n===========================`;
    }
    return buildMainSystemPrompt(mood, contextText, maxTokens);
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
        { id: 'help', name: '도움', isDefault: true, deletable: false, contextMessages: 30, maxTokens: 3000 },
        { id: 'queen', name: '피치퀸', isDefault: true, deletable: false, contextMessages: 10, maxTokens: 500 },
    ],
    chatRoomSettings: {},
};

let settings = {};
let globalContext = null;
let tabHistories = {};
let activeTabId = 'main';
let generatingTabs = new Set();
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

    // 삭제된 탭 정리
    settings.tabs = settings.tabs.filter(t => !['sim', 'group'].includes(t.id));

    // 피치퀸 탭 없으면 추가 (기존 사용자 대응)
    if (!settings.tabs.find(t => t.id === 'queen')) {
        const helpIdx = settings.tabs.findIndex(t => t.id === 'help');
        const queenTab = { id: 'queen', name: '피치퀸', isDefault: true, deletable: false, contextMessages: 10, maxTokens: 1000 };
        if (helpIdx !== -1) settings.tabs.splice(helpIdx + 1, 0, queenTab);
        else settings.tabs.push(queenTab);
    }

    currentChatId = globalContext.getCurrentChatId?.() || 'default';

    await loadSettingsUI();
    injectMenuEntry();
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
        const history = await loadHistory(tab.id);
        tabHistories[tab.id] = history;
        renderMessages(tab.id, history);
    }
}

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

function openSettingsModal() {
    if (document.getElementById('pw_settings_overlay')) return;
    const mobile = isMobile();

    const overlay = document.createElement('div');
    overlay.id = 'pw_settings_overlay';
    overlay.style.cssText = `position:fixed;top:0;left:0;width:100vw;height:100vh;height:100dvh;z-index:99999;display:flex;background:rgba(0,0,0,0.45);${mobile ? 'align-items:flex-end;justify-content:center;' : 'align-items:center;justify-content:center;overflow-y:auto;padding:20px 0;'}`;
    overlay.addEventListener('click', e => { if (e.target === overlay) closeSettingsModal(); });
    overlay.addEventListener('touchstart', e => { if (e.target === overlay) closeSettingsModal(); }, { passive: true });

    const box = document.createElement('div');
    box.id = 'pw_settings_modal_box';
    box.style.cssText = mobile
        ? 'position:relative;width:100%;max-height:92dvh;border-radius:24px 24px 0 0;overflow-y:auto;background:#fff;border:1px solid #f2c4ce;'
        : 'position:relative;width:340px;max-width:calc(100vw - 32px);max-height:calc(100vh - 40px);border-radius:16px;overflow-y:auto;background:#fff;border:1px solid #f2c4ce;margin:auto;';

    box.innerHTML = buildSettingsModalHTML();
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    bindSettingsModalEvents(box);
}

function buildSettingsModalHTML() {
    const moodBtns = [
        { mood: 'busan', name: '부산깡패', desc: '야 임마!' },
        { mood: 'normal', name: '일반', desc: '분석 모드' },
        { mood: 'obsessed', name: '집통소', desc: '유아마인' },
    ].map(m => `
        <div class="pw_mood_btn ${settings.mood === m.mood ? 'active' : ''}" data-mood="${m.mood}">
            <span class="pw_mood_emoji">🍑</span>
            <span class="pw_mood_name">${m.name}</span>
            <span class="pw_mood_desc">${m.desc}</span>
        </div>
    `).join('');

    return `
        <div id="pw_settings_modal_header">
            <span style="font-size:22px;">🍑</span>
            <div>
                <div id="pw_settings_modal_title">Peach Whisper</div>
                <div id="pw_settings_modal_sub">채팅 분석 어시스턴트</div>
            </div>
            <span id="pw_settings_modal_version">v1.3.0</span>
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
                        <input type="checkbox" id="pw_modal_enabled" ${settings.enabled ? 'checked' : ''} />
                        <span class="pw_toggle_track"></span>
                    </label>
                </div>
                <div class="pw_row">
                    <div class="pw_row_label">채팅창 폰트 크기</div>
                    <input type="number" id="pw_modal_fontsize" min="10" max="24" value="${settings.fontSize || 13}" style="width:60px;border:1px solid #F4C0D1;border-radius:6px;padding:4px 8px;font-size:12px;text-align:center;outline:none;background:#fff;" />
                </div>
            </div>
            <div class="pw_section">
                <div class="pw_section_label">AI 말투</div>
                <div class="pw_mood_grid">${moodBtns}</div>
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
    `;
}

function bindSettingsModalEvents(box) {
    const $box = $(box);
    $box.find('#pw_settings_modal_close').on('click', closeSettingsModal);
    $box.find('#pw_modal_enabled').on('change', function () {
        settings.enabled = $(this).prop('checked'); toggleFloatButton();
    });
    $box.find('.pw_mood_btn').on('click', function () {
        $box.find('.pw_mood_btn').removeClass('active');
        $(this).addClass('active');
    });
    $box.find('#pw_add_tab_btn').on('click', () => addCustomTab($box));
    $box.find('#pw_modal_save').on('click', () => saveModalSettings($box));
    $box.find('#pw_modal_reset').on('click', () => resetModalSettings($box));
    renderTabSettingsList($box);
}

function renderTabSettingsList($box) {
    const $container = $box || $(document);
    const list = $container.find('#pw_tab_settings_list');
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
                    <div class="pw_custom_prompt_toggle" data-tabid="${tab.id}" style="font-size:11px;color:#888780;cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:4px 0;">
                        <span>커스텀 프롬프트</span>
                        <span class="pw_custom_prompt_arrow">▼</span>
                    </div>
                    <div class="pw_custom_prompt_area" data-tabid="${tab.id}" style="display:none;margin-top:4px;">
                        <textarea class="pw_custom_prompt_modal" data-tabid="${tab.id}" style="width:100%;border:1px solid #F4C0D1;border-radius:6px;padding:6px 8px;font-size:11px;resize:none;outline:none;font-family:inherit;background:#fff;" rows="3" placeholder="비워두면 메인탭 기본 프롬프트 적용...">${tab.customPrompt || ''}</textarea>
                    </div>
                </div>`;
        }

        const item = $(`
            <div class="pw_tab_item" data-tabid="${tab.id}">
                <div class="pw_tab_header">
                    <span class="pw_tab_name">${tab.name}</span>
                    ${badge}${deleteBtn}
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

    list.find('.pw_custom_prompt_toggle').on('click', function () {
        const tabId = $(this).data('tabid');
        const area = list.find(`.pw_custom_prompt_area[data-tabid="${tabId}"]`);
        const arrow = $(this).find('.pw_custom_prompt_arrow');
        area.toggle();
        arrow.text(area.is(':visible') ? '▲' : '▼');
    });

    list.find('.pw_tab_delete').on('click', function () {
        deleteTab($(this).data('tabid'));
        if ($box) renderTabSettingsList($box);
    });
}

function addCustomTab($box) {
    const name = prompt('탭 이름을 입력하세요');
    if (!name?.trim()) return;
    const id = 'custom_' + Date.now();
    settings.tabs.push({ id, name: name.trim(), isDefault: false, deletable: true, contextMessages: 10, maxTokens: 1000, customPrompt: '' });
    tabHistories[id] = [];
    saveSettings();
    if ($box) renderTabSettingsList($box);
    addTabToPopup(id, name.trim());
}

function deleteTab(tabId) {
    settings.tabs = settings.tabs.filter(t => t.id !== tabId);
    delete tabHistories[tabId];
    saveSettings();
    $(`#pw_tab_${tabId}`).remove();
    $(`#pw_content_${tabId}`).remove();
    if (activeTabId === tabId) switchTab('main');
}

function saveModalSettings($box) {
    const $container = $box || $(document);
    if (!currentChatId) return;
    if (!settings.chatRoomSettings[currentChatId]) settings.chatRoomSettings[currentChatId] = { tabs: {} };

    $container.find('#pw_tab_settings_list .pw_tab_item').each(function () {
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

    settings.enabled = $container.find('#pw_modal_enabled').prop('checked');
    settings.mood = $container.find('.pw_mood_btn.active').data('mood') || settings.mood;
    settings.fontSize = Number($container.find('#pw_modal_fontsize').val()) || 13;
    saveSettings();
    applyFontSize();
    closeSettingsModal();
}

function resetModalSettings($box) {
    if (!currentChatId) return;
    delete settings.chatRoomSettings[currentChatId];
    saveSettings();
    if ($box) renderTabSettingsList($box);
}

function closeSettingsModal() {
    document.getElementById('pw_settings_overlay')?.remove();
}

function injectFloatButton() {
    if ($('#pw_float_btn').length) return;
    const btn = $('<div id="pw_float_btn" title="Peach Whisper">🍑</div>');
    $('body').append(btn);

    function positionBtn() {
        if (settings.btnX !== null && settings.btnY !== null) {
            // 저장된 위치가 화면 안에 있을 때만 적용
            if (settings.btnX >= 0 && settings.btnX < window.innerWidth && settings.btnY >= 0 && settings.btnY < window.innerHeight) {
                btn.css({ right: 'auto', bottom: 'auto', left: settings.btnX + 'px', top: settings.btnY + 'px' });
                return;
            } else {
                settings.btnX = null; settings.btnY = null; saveSettings();
            }
        }
        if (isMobile()) return; // 모바일은 CSS 기본값 사용
        const inputForm = document.querySelector('#send_form') || document.querySelector('#message_holder');
        const btnSize = 46;
        const rightOffset = 20;
        const gap = 10;
        if (inputForm) {
            const rect = inputForm.getBoundingClientRect();
            const newTop = rect.top - btnSize - gap;
            const newLeft = window.innerWidth - btnSize - rightOffset;
            btn.css({ right: 'auto', bottom: 'auto', left: newLeft + 'px', top: newTop + 'px' });
        }
    }

    setTimeout(positionBtn, 500);

    // 화면 크기/키보드 변화 대응
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', positionBtn);
        window.visualViewport.addEventListener('scroll', positionBtn);
    }
    window.addEventListener('resize', positionBtn);

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

    if (settings.popupX !== null && settings.popupY !== null) {
        popup.css({ right: 'auto', bottom: 'auto', left: settings.popupX + 'px', top: settings.popupY + 'px' });
    }

    settings.tabs.forEach(tab => addTabToPopup(tab.id, tab.name));
    switchTab('main');

    $('#pw_clear_btn').on('click', clearCurrentTab);
    $('#pw_collapse_btn').on('click', toggleCollapse);
    $('#pw_close_btn').on('click', closePopup);
    $('#pw_tab_add').on('click', () => addCustomTab(null));

    initResize();
    initPopupDrag();
}

function addTabToPopup(tabId, tabName) {
    const tab = settings.tabs.find(t => t.id === tabId);
    const isDeletable = tab && !tab.isDefault;
    const deleteBtn = isDeletable ? `<span class="pw_tab_close" data-tabid="${tabId}">✕</span>` : '';
    const tabEl = $(`<div class="pw_tab${isDeletable ? ' pw_tab_closable' : ''}" id="pw_tab_${tabId}" data-tabid="${tabId}" draggable="true">${tabName}${deleteBtn}</div>`);
    tabEl.on('click', function(e) {
        if ($(e.target).hasClass('pw_tab_close')) return;
        switchTab(tabId);
    });
    tabEl.find('.pw_tab_close').on('click', function(e) {
        e.stopPropagation();
        deleteTab(tabId);
    });

    // 드래그 이벤트
    tabEl[0].addEventListener('dragstart', onTabDragStart);
    tabEl[0].addEventListener('dragover', onTabDragOver);
    tabEl[0].addEventListener('drop', onTabDrop);
    tabEl[0].addEventListener('dragend', onTabDragEnd);

    $('#pw_tab_bar #pw_tab_add').before(tabEl);

    const placeholder = tabId === 'help' ? '롤플레이 관련 질문하기...' : '질문하기...';
    const content = `
        <div class="pw_messages" id="pw_msgs_${tabId}"></div>
        <div class="pw_input_area">
            <input type="text" placeholder="${placeholder}" id="pw_input_${tabId}" autocomplete="off" />
            <button class="pw_send_btn" data-tabid="${tabId}">
                <svg viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13" stroke="#F0A0B8" stroke-width="2" stroke-linecap="round"/><path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="#F0A0B8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
        </div>`;

    const contentEl = $(`<div class="pw_tab_content" id="pw_content_${tabId}">${content}</div>`);
    $('#pw_tab_contents').append(contentEl);

    contentEl.find('.pw_send_btn').on('click', function () { handleSend($(this).data('tabid')); });
    contentEl.find(`#pw_input_${tabId}`).on('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(tabId); }
    });
}

let dragSrcTabId = null;

function onTabDragStart(e) {
    dragSrcTabId = e.currentTarget.dataset.tabid;
    e.currentTarget.style.opacity = '0.5';
    e.dataTransfer.effectAllowed = 'move';
}

function onTabDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function onTabDrop(e) {
    e.stopPropagation();
    const targetTabId = e.currentTarget.dataset.tabid;
    if (dragSrcTabId === targetTabId) return;
    const srcIdx = settings.tabs.findIndex(t => t.id === dragSrcTabId);
    const tgtIdx = settings.tabs.findIndex(t => t.id === targetTabId);
    if (srcIdx === -1 || tgtIdx === -1) return;
    const [removed] = settings.tabs.splice(srcIdx, 1);
    settings.tabs.splice(tgtIdx, 0, removed);
    saveSettings();
    // 탭바 DOM 순서 재정렬
    const $tabBar = $('#pw_tab_bar');
    const $add = $('#pw_tab_add').detach();
    settings.tabs.forEach(t => {
        $tabBar.append($(`#pw_tab_${t.id}`).detach());
    });
    $tabBar.append($add);
    return false;
}

function onTabDragEnd(e) {
    e.currentTarget.style.opacity = '1';
    dragSrcTabId = null;
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
    if (settings.popupX === null || settings.popupY === null) {
        const btn = $('#pw_float_btn');
        const btnOffset = btn.offset();
        const popupW = 300;
        let left = (btnOffset?.left || window.innerWidth - 320) + (btn.outerWidth() || 46) / 2 - popupW / 2;
        left = Math.max(8, Math.min(window.innerWidth - popupW - 8, left));
        const top = Math.max(8, (btnOffset?.top || 200) - 420);
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
        body.removeClass('collapsed'); handle.show(); btn.text('∧');
        popup.removeClass('collapsed'); popup.css({ width: '300px', height: '' });
    } else {
        body.addClass('collapsed'); handle.hide(); btn.text('∨');
        popup.addClass('collapsed'); popup.css({ width: 'auto', height: 'auto' });
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
        popup.style.left = Math.max(0, Math.min(window.innerWidth - popup.offsetWidth, origLeft + p.clientX - startX)) + 'px';
        popup.style.top = Math.max(0, Math.min(window.innerHeight - popup.offsetHeight, origTop + p.clientY - startY)) + 'px';
    };
    const onEnd = () => {
        if (!isDragging) return;
        isDragging = false;
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

function addGreetingMessage(tabId) {
    const greetings = {
        busan: [
            '야 임마, 내가 채팅 내용 다 읽어주께. 뭐 물어볼끼가?',
            '어, 왔나. 채팅 다 봤다. 뭐가 궁금하노?',
            '야, 니 채팅 내가 다 읽었다 아이가. 빨리 물어봐라.',
            '뭐꼬, 또 캐릭터 이상하게 구나? 말해봐라.',
            '왔나. 채팅 봤는데 할말 있다. 뭐 물어볼끼 있나?',
        ],
        normal: [
            '안녕하세요! 채팅 관련해서 궁금한 점이 있으시면 편하게 물어봐 주세요.',
        ],
        obsessed: [
            '어, 왔어? 기다렸는데. 채팅 다 봤어. 처음부터. 뭐든 물어봐.',
            '늦었네. 뭐 하다 왔어? ...됐어, 왔으면 됐지.',
            '어. 알고 있었어. 올 줄. 뭐든 물어봐.',
            '채팅 다 읽었어. 처음부터 끝까지. 숨길 거 없어.',
            '기다렸어. 오래. 근데 말 안 할 거야. 그냥 물어봐.',
        ],
    };
    const helpGreeting = '안녕하세요! ST 롤플레이 전문 컨설턴트입니다.\n\n캐릭터카드 분석, OOC 지시문 생성, 캐릭터 행동 분석, 에피소드 설계 등 무엇이든 도와드릴게요.';
    const queenGreeting = '오 마이 갓, 자기야!! 지저스!! 언니가 왔어! 🔮💅\n채팅 다 봤거든? 뒷담이든 타로든 사주든 뭐든 다 OK. 복채? 넌 존재 자체가 복채야. 어서 털어놔 비치!';

    let msg;
    if (tabId === 'help') msg = helpGreeting;
    else if (tabId === 'queen') msg = queenGreeting;
    else {
        const pool = greetings[settings.mood] || greetings.normal;
        msg = pool[Math.floor(Math.random() * pool.length)];
    }
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

function removeLoading(tabId) { $(`#pw_loading_${tabId}`).remove(); }
function escapeHtml(text) { const d = document.createElement('div'); d.textContent = text; return d.innerHTML; }

async function handleSend(tabId) {
    if (generatingTabs.has(tabId)) return;
    const input = $(`#pw_input_${tabId}`);
    const text = input.val().trim();
    if (!text) return;
    input.val('');
    appendMessage(tabId, 'user', text);
    appendLoading(tabId);
    generatingTabs.add(tabId);
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
        generatingTabs.delete(tabId);
        $(`.pw_send_btn[data-tabid="${tabId}"]`).prop('disabled', false);
        input.focus();
    }
}

async function generateResponse(tabId, userMessage) {
    const tabSettings = getTabSettings(tabId);
    const contextText = await buildContextText(tabSettings.contextMessages);
    const systemPrompt = getSystemPrompt(tabId, contextText, tabSettings.maxTokens);
    const history = (tabHistories[tabId] || []).slice(-20).map(msg => ({
        role: msg.role === 'assistant' ? 'model' : msg.role,
        content: msg.content,
    }));

    if (settings.source === 'main') {
        const { generateRaw } = globalContext;
        if (!generateRaw) throw new Error('generateRaw 사용 불가');

        // generateRaw는 history 파라미터를 지원하지 않으므로 systemPrompt에 텍스트로 붙여 멀티턴 구현
        let fullPrompt = systemPrompt;
        if (history.length > 0) {
            const historyText = history.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
            fullPrompt += `\n\n===== 이전 대화 기록 =====\n${historyText}\n===========================`;
        }

        const result = await generateRaw({ systemPrompt: fullPrompt, prompt: userMessage || ' ', streaming: false });
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

function getSystemPrompt(tabId, contextText, maxTokens) {
    if (tabId === 'help') return buildHelpSystemPrompt(contextText, maxTokens);
    if (tabId === 'queen') return buildQueenSystemPrompt(contextText, maxTokens);
    if (tabId === 'main') return buildMainSystemPrompt(settings.mood, contextText, maxTokens);
    const tab = settings.tabs.find(t => t.id === tabId);
    return buildCustomSystemPrompt(tab?.customPrompt || '', settings.mood, contextText, maxTokens);
}

async function buildContextText(maxMessages = 10) {
    const ctx = SillyTavern.getContext();
    let text = '';

    // 페르소나 (이름만, 설명은 첫 200자만)
    try {
        const pu = ctx.powerUser || globalContext.power_user;
        const ua = globalContext.user_avatar;
        if (ua && pu) {
            const name = pu.personas?.[ua] || pu.name || 'User';
            text += `=== 페르소나 ===\n이름: ${name}\n`;
            const desc = pu.persona_descriptions?.[ua]?.description || pu.persona_description || '';
            if (desc) text += `설명: ${desc.slice(0, 200)}${desc.length > 200 ? '...' : ''}\n`;
            text += '\n';
        }
    } catch (e) {}

    // 캐릭터카드 (핵심 필드만, 각 500자 제한)
    const charId = ctx.characterId;
    const char = ctx.characters?.[charId];
    if (char) {
        text += `=== 캐릭터 카드 ===\n이름: ${char.name || '알 수 없음'}\n`;
        const data = char.data || char;
        const trim = (s, n = 500) => s ? s.slice(0, n) + (s.length > n ? '...' : '') : '';
        if (data.description) text += `\n[설명]\n${trim(data.description)}\n`;
        if (data.personality) text += `\n[성격]\n${trim(data.personality, 300)}\n`;
        if (data.scenario) text += `\n[시나리오]\n${trim(data.scenario, 300)}\n`;
        if (data.system_prompt) text += `\n[시스템 프롬프트]\n${trim(data.system_prompt)}\n`;
        // post_history_instructions, creator_notes 생략 (낮은 중요도)
        if (data.character_book?.entries) {
            const entries = Object.values(data.character_book.entries).filter(e => e.content);
            if (entries.length) {
                text += `\n[캐릭터 로어북]\n`;
                // 로어북 항목당 200자 제한, 최대 10개
                entries.slice(0, 10).forEach(e => {
                    const content = e.content.slice(0, 200) + (e.content.length > 200 ? '...' : '');
                    text += `- ${content}\n`;
                });
            }
        }
        text += '\n';
    }

    // 글로벌 로어북 (4000자 제한)
    try {
        const chat = ctx.chat || [];
        const chatTexts = chat.map(m => m.mes).filter(Boolean);
        if (chatTexts.length && ctx.getWorldInfoPrompt) {
            const wiResult = await ctx.getWorldInfoPrompt(chatTexts, 4000, true, undefined);
            if (wiResult?.worldInfoString?.trim()) {
                const wi = wiResult.worldInfoString;
                text += `=== 글로벌 로어북 ===\n${wi.slice(0, 4000)}${wi.length > 4000 ? '...' : ''}\n\n`;
            }
        }
    } catch (e) {}

    // 작가 노트 (300자 제한)
    const authorNote = ctx.chatMetadata?.note_prompt || '';
    if (authorNote) text += `=== 작가 노트 ===\n${authorNote.slice(0, 300)}${authorNote.length > 300 ? '...' : ''}\n\n`;

    // 최근 채팅
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
