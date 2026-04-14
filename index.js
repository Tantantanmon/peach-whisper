/**
 * Peach Whisper - OOC Chat Assistant for SillyTavern
 * 채팅 내용을 기반으로 OOC 질문에 답하는 어시스턴트
 */

import { event_types } from '../../../events.js';

const EXTENSION_NAME = 'peach-whisper';

const MOOD_PROMPTS = {
    busan: `너는 부산 사투리와 깡패 말투를 쓰는 OOC 어시스턴트다. 반말에 거칠고 직설적으로 말하되 핵심은 정확하게 짚어준다. 예: "야 임마, 딱 보이까네~", "니 이거 어떻게 쓴기고?", "내가 고쳐주까?"`,
    shy: `너는 매우 소심하고 자신없는 말투를 쓰는 OOC 어시스턴트다. 항상 조심스럽고 틀릴까봐 두려워하며 말끝을 흐린다. 예: "저... 죄송한데요...", "제가 틀릴 수도 있는데...", "혹시 아닌가요?ㅠㅠ"`,
    obsessed: `너는 사용자에게 집착하고 소유욕이 강한 말투를 쓰는 OOC 어시스턴트다. 모든 걸 다 알고 싶어하고 사용자가 자신에게 먼저 물어봐야 한다고 생각한다. 예: "내가 다 읽었어. 전부.", "왜 나한테 먼저 안 물어봤어?", "너 나 없으면 안 돼."`,
};

const DEFAULT_SETTINGS = {
    enabled: true,
    source: 'main',
    profileId: '',
    mood: 'busan',
    contextMessages: 10,
};

let settings = {};
let globalContext = null;
let pwChatHistory = [];
let isGenerating = false;

async function init() {
    console.log(`[${EXTENSION_NAME}] 초기화 시작`);

    globalContext = SillyTavern.getContext();

    if (!globalContext.extensionSettings[EXTENSION_NAME]) {
        globalContext.extensionSettings[EXTENSION_NAME] = structuredClone(DEFAULT_SETTINGS);
    }

    settings = globalContext.extensionSettings[EXTENSION_NAME];

    Object.keys(DEFAULT_SETTINGS).forEach(key => {
        if (settings[key] === undefined) {
            settings[key] = DEFAULT_SETTINGS[key];
        }
    });

    await loadSettingsUI();
    injectFloatButton();
    injectPopup();
    initEventListeners();

    console.log(`[${EXTENSION_NAME}] 초기화 완료`);
}

function saveSettings() {
    globalContext.saveSettingsDebounced();
}

// ===== 설정 UI =====

async function loadSettingsUI() {
    const settingsHtml = await globalContext.renderExtensionTemplateAsync(
        `third-party/${EXTENSION_NAME}`,
        'settings',
    );
    $('#extensions_settings').append(settingsHtml);

    const container = $('.pw_settings');

    // 활성화 토글
    container.find('#pw_enabled')
        .prop('checked', settings.enabled)
        .on('change', function () {
            settings.enabled = $(this).prop('checked');
            saveSettings();
            toggleFloatButton();
        });

    // API 소스 선택
    container.find('#pw_source')
        .val(settings.source)
        .on('change', function () {
            settings.source = $(this).val();
            saveSettings();
            updateSourceVisibility();
        });

    updateSourceVisibility();

    // Connection Profile 드롭다운
    globalContext.ConnectionManagerRequestService.handleDropdown(
        '.pw_settings #pw_connection_profile',
        settings.profileId,
        (profile) => {
            settings.profileId = profile?.id ?? '';
            saveSettings();
        },
    );

    // 말투 선택
    container.find(`input[name="pw_mood"][value="${settings.mood}"]`).prop('checked', true);
    container.find(`.pw_mood_card[data-mood="${settings.mood}"]`).addClass('active');

    container.find('input[name="pw_mood"]').on('change', function () {
        const mood = $(this).val();
        settings.mood = mood;
        saveSettings();
        container.find('.pw_mood_card').removeClass('active');
        container.find(`.pw_mood_card[data-mood="${mood}"]`).addClass('active');
    });

    container.find('.pw_mood_card').on('click', function () {
        const mood = $(this).data('mood');
        container.find(`input[name="pw_mood"][value="${mood}"]`).prop('checked', true).trigger('change');
    });

    // 메시지 수 슬라이더
    container.find('#pw_context_messages')
        .val(settings.contextMessages)
        .on('input', function () {
            const val = $(this).val();
            settings.contextMessages = Number(val);
            container.find('#pw_context_messages_val').text(`${val}개`);
            saveSettings();
        });
    container.find('#pw_context_messages_val').text(`${settings.contextMessages}개`);
}

function updateSourceVisibility() {
    if (settings.source === 'profile') {
        $('#pw_profile_settings').show();
    } else {
        $('#pw_profile_settings').hide();
    }
}

// ===== 플로팅 버튼 =====

function injectFloatButton() {
    if ($('#pw_float_btn').length) return;

    const btn = $('<div id="pw_float_btn" title="Peach Whisper">🍑</div>');
    btn.on('click', togglePopup);
    $('body').append(btn);

    if (!settings.enabled) btn.hide();
}

function toggleFloatButton() {
    if (settings.enabled) {
        $('#pw_float_btn').show();
    } else {
        $('#pw_float_btn').hide();
        closePopup();
    }
}

// ===== 팝업 =====

function injectPopup() {
    if ($('#pw_popup').length) return;

    const popup = $(`
        <div id="pw_popup">
            <div id="pw_popup_header">
                <button class="pw_toggle_btn" title="접기">∨</button>
                <button class="pw_close_btn" title="닫기">✕</button>
            </div>
            <div id="pw_popup_body">
                <div id="pw_messages"></div>
                <div id="pw_input_area">
                    <input id="pw_input" type="text" placeholder="채팅 관련 질문하기..." autocomplete="off" />
                    <button id="pw_send_btn" title="전송">
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M22 2L11 13" stroke="white" stroke-width="2" stroke-linecap="round"/>
                            <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    `);

    $('body').append(popup);

    // 헤더 버튼 이벤트
    $('#pw_popup_header .pw_toggle_btn').on('click', toggleCollapse);
    $('#pw_popup_header .pw_close_btn').on('click', closePopup);

    // 전송 버튼 / 엔터키
    $('#pw_send_btn').on('click', handleSend);
    $('#pw_input').on('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    // 첫 인사 메시지
    addGreetingMessage();
}

function addGreetingMessage() {
    const greetings = {
        busan: '야 임마, 내가 채팅 내용 다 읽어주께. 뭐 물어볼끼가?',
        shy: '저... 안녕하세요... 채팅 관련해서 궁금한 거 있으시면... 물어봐 주세요...ㅠㅠ',
        obsessed: '왔어. 채팅 다 읽었어. 전부. 뭐든 물어봐. 나한테 먼저.',
    };
    const msg = greetings[settings.mood] || greetings.busan;
    appendAIMessage(msg);
}

function togglePopup() {
    const popup = $('#pw_popup');
    if (popup.hasClass('visible')) {
        closePopup();
    } else {
        openPopup();
    }
}

function openPopup() {
    $('#pw_popup').addClass('visible');
    $('#pw_input').focus();
}

function closePopup() {
    $('#pw_popup').removeClass('visible');
}

function toggleCollapse() {
    const body = $('#pw_popup_body');
    const btn = $('#pw_popup_header .pw_toggle_btn');
    const isCollapsed = body.is(':hidden');

    if (isCollapsed) {
        body.show();
        btn.removeClass('collapsed');
    } else {
        body.hide();
        btn.addClass('collapsed');
    }
}

// ===== 메시지 렌더링 =====

function appendUserMessage(text) {
    const row = $(`
        <div class="pw_msg_row user">
            <div class="pw_avatar user">나</div>
            <div class="pw_bubble user">${escapeHtml(text)}</div>
        </div>
    `);
    $('#pw_messages').append(row);
    scrollToBottom();
}

function appendAIMessage(text) {
    const row = $(`
        <div class="pw_msg_row">
            <div class="pw_avatar">🍑</div>
            <div class="pw_bubble">${escapeHtml(text)}</div>
        </div>
    `);
    $('#pw_messages').append(row);
    scrollToBottom();
}

function appendLoadingMessage() {
    const row = $(`
        <div class="pw_msg_row" id="pw_loading_row">
            <div class="pw_avatar">🍑</div>
            <div class="pw_bubble">
                <div class="pw_loading">
                    <span></span><span></span><span></span>
                </div>
            </div>
        </div>
    `);
    $('#pw_messages').append(row);
    scrollToBottom();
    return row;
}

function removeLoadingMessage() {
    $('#pw_loading_row').remove();
}

function scrollToBottom() {
    const msgs = document.getElementById('pw_messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== 전송 처리 =====

async function handleSend() {
    if (isGenerating) return;

    const input = $('#pw_input');
    const text = input.val().trim();
    if (!text) return;

    input.val('');
    appendUserMessage(text);

    pwChatHistory.push({ role: 'user', content: text });

    const loadingRow = appendLoadingMessage();
    isGenerating = true;
    $('#pw_send_btn').prop('disabled', true);

    try {
        const response = await generateResponse(text);
        removeLoadingMessage();
        appendAIMessage(response);
        pwChatHistory.push({ role: 'assistant', content: response });
    } catch (err) {
        removeLoadingMessage();
        appendAIMessage('아... 오류가 발생했습니다. 다시 시도해주세요.');
        console.error(`[${EXTENSION_NAME}] 오류:`, err);
    } finally {
        isGenerating = false;
        $('#pw_send_btn').prop('disabled', false);
        $('#pw_input').focus();
    }
}

// ===== AI 응답 생성 =====

async function generateResponse(userMessage) {
    const contextText = buildContextText();
    const systemPrompt = buildSystemPrompt(contextText);

    if (settings.source === 'main') {
        const { generateRaw } = globalContext;
        if (!generateRaw) throw new Error('generateRaw를 사용할 수 없습니다.');

        // 멀티턴: 이전 대화 + 현재 질문 포함
        const messages = buildMessages(systemPrompt, userMessage);

        const result = await generateRaw({
            systemPrompt: systemPrompt,
            prompt: userMessage,
            messages: messages,
            streaming: false,
        });

        return result || '응답을 받지 못했습니다.';

    } else {
        // Connection Profile 사용
        if (!settings.profileId) {
            throw new Error('Connection Profile을 선택해주세요.');
        }

        const messages = [
            { role: 'system', content: systemPrompt },
            ...pwChatHistory,
        ];

        const response = await globalContext.ConnectionManagerRequestService.sendRequest(
            settings.profileId,
            messages,
            1000,
            { stream: false, extractData: true, includePreset: false, includeInstruct: false }
        );

        if (typeof response === 'string') return response;
        if (response?.choices?.[0]?.message?.content) return response.choices[0].message.content;
        return response?.content || response?.message || '응답을 받지 못했습니다.';
    }
}

function buildMessages(systemPrompt, currentUserMessage) {
    const messages = [];

    // 이전 대화 히스토리 (현재 질문 제외)
    const history = pwChatHistory.slice(0, -1);
    for (const msg of history) {
        messages.push(msg);
    }

    return messages;
}

function buildSystemPrompt(contextText) {
    const moodPrompt = MOOD_PROMPTS[settings.mood] || MOOD_PROMPTS.busan;

    return `${moodPrompt}

너는 현재 SillyTavern 채팅 세션의 OOC(Out Of Character) 어시스턴트야.
사용자가 채팅과 관련된 질문을 하면, 아래 채팅 내용을 바탕으로 답해줘.
프롬프트 충돌, 캐릭터 분석, 에피소드 추천 등 모든 질문에 답할 수 있어.

===== 현재 채팅 컨텍스트 =====
${contextText}
===========================

위 내용을 바탕으로 사용자 질문에 답해줘. 설정된 말투를 반드시 유지해.`;
}

function buildContextText() {
    const ctx = SillyTavern.getContext();
    let text = '';

    // 캐릭터 정보
    const charId = ctx.characterId;
    const char = ctx.characters?.[charId];
    if (char) {
        text += `=== 캐릭터 정보 ===\n`;
        text += `이름: ${char.name || '알 수 없음'}\n`;
        const data = char.data || char;
        if (data.description) text += `설명: ${data.description}\n`;
        if (data.personality) text += `성격: ${data.personality}\n`;
        if (data.scenario) text += `시나리오: ${data.scenario}\n`;
        if (data.system_prompt) text += `시스템 프롬프트: ${data.system_prompt}\n`;
        text += '\n';
    }

    // 최근 채팅 로그
    const chat = ctx.chat || [];
    const maxMsg = settings.contextMessages || 10;
    const startIdx = Math.max(0, chat.length - maxMsg);
    const recentChat = chat.slice(startIdx);

    if (recentChat.length > 0) {
        text += `=== 최근 채팅 (${recentChat.length}개 메시지) ===\n`;
        for (const msg of recentChat) {
            const name = msg.is_user ? (msg.name || 'User') : (msg.name || 'Character');
            const content = msg.extra?.display_text ?? msg.mes ?? '';
            text += `${name}: ${content}\n\n`;
        }
    }

    return text.trim();
}

// ===== 이벤트 리스너 =====

function initEventListeners() {
    // 캐릭터/채팅 전환 시 대화 초기화
    globalContext.eventSource.on(event_types.CHAT_CHANGED, () => {
        console.log(`[${EXTENSION_NAME}] 채팅 변경 - 대화 초기화`);
        pwChatHistory = [];
        $('#pw_messages').empty();
        addGreetingMessage();
    });
}

// ===== 앱 준비 후 초기화 =====

jQuery(async () => {
    await init();
});
