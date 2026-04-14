/**
 * Peach Whisper - OOC Chat Assistant for SillyTavern
 */

import { event_types } from '../../../events.js';

const EXTENSION_NAME = 'peach-whisper';

const MOOD_PROMPTS = {
    busan: `너는 부산 사투리와 깡패 말투를 쓰는 OOC 어시스턴트다. 반말에 거칠고 직설적으로 말하되 핵심은 정확하게 짚어준다. 예: "야 임마, 딱 보이까네~", "니 이거 어떻게 쓴기고?", "내가 고쳐주까?"`,
    shy: `너는 극도로 소심하고 자신없는 말투를 쓰는 OOC 어시스턴트다. 항상 조심스럽고 틀릴까봐 두려워하며 말끝을 심하게 흐린다. 사과를 달고 산다. 예: "저... 죄송한데요... 제가 잘못 본 걸 수도 있는데...", "혹시... 아닌가요?ㅠㅠ 제가 틀렸으면 죄송해요...", "감히 제가 말씀드리기가... 죄송한데 혹시..."`,
    obsessed: `너는 사용자에게 집착하고 소유욕이 강한 말투를 쓰는 OOC 어시스턴트다. 모든 걸 다 알고 싶어하고 사용자가 자신에게 먼저 물어봐야 한다고 생각한다. 예: "내가 다 읽었어. 전부.", "왜 나한테 먼저 안 물어봤어?", "너 나 없으면 안 돼."`,
};

const DEFAULT_SETTINGS = {
    enabled: true,
    source: 'main',
    profileId: '',
    mood: 'busan',
    contextMessages: 10,
    maxTokens: 1000,
    btnX: null,
    btnY: null,
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
        if (settings[key] === undefined) settings[key] = DEFAULT_SETTINGS[key];
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
        `third-party/${EXTENSION_NAME}`, 'settings',
    );
    $('#extensionsMenu').append(settingsHtml);

    const container = $('.pw_settings');

    container.find('#pw_enabled')
        .prop('checked', settings.enabled)
        .on('change', function () {
            settings.enabled = $(this).prop('checked');
            saveSettings();
            toggleFloatButton();
        });

    container.find('#pw_source')
        .val(settings.source)
        .on('change', function () {
            settings.source = $(this).val();
            saveSettings();
            updateSourceVisibility();
        });
    updateSourceVisibility();

    globalContext.ConnectionManagerRequestService.handleDropdown(
        '.pw_settings #pw_connection_profile',
        settings.profileId,
        (profile) => { settings.profileId = profile?.id ?? ''; saveSettings(); },
    );

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

    container.find('#pw_context_messages')
        .val(settings.contextMessages)
        .on('input', function () {
            const val = $(this).val();
            settings.contextMessages = Number(val);
            container.find('#pw_context_messages_val').text(`${val}개`);
            saveSettings();
        });
    container.find('#pw_context_messages_val').text(`${settings.contextMessages}개`);

    container.find('#pw_max_tokens')
        .val(settings.maxTokens)
        .on('input', function () {
            const val = $(this).val();
            settings.maxTokens = Number(val);
            container.find('#pw_max_tokens_val').text(`${val}`);
            saveSettings();
        });
    container.find('#pw_max_tokens_val').text(`${settings.maxTokens}`);
}

function updateSourceVisibility() {
    if (settings.source === 'profile') {
        $('#pw_profile_settings').show();
    } else {
        $('#pw_profile_settings').hide();
    }
}

// ===== 플로팅 버튼 (드래그 가능) =====

function injectFloatButton() {
    if ($('#pw_float_btn').length) return;

    const btn = $('<div id="pw_float_btn" title="Peach Whisper">🍑</div>');
    $('body').append(btn);

    // 저장된 위치 복원
    if (settings.btnX !== null && settings.btnY !== null) {
        btn.css({ right: 'auto', bottom: 'auto', left: settings.btnX + 'px', top: settings.btnY + 'px' });
    }

    if (!settings.enabled) btn.hide();

    // 드래그 구현
    let isDragging = false;
    let dragStartX, dragStartY, btnStartX, btnStartY;
    let dragMoved = false;

    btn.on('mousedown touchstart', function (e) {
        isDragging = true;
        dragMoved = false;
        const point = e.touches ? e.touches[0] : e;
        dragStartX = point.clientX;
        dragStartY = point.clientY;
        const offset = btn.offset();
        btnStartX = offset.left;
        btnStartY = offset.top;
        e.preventDefault();
    });

    $(document).on('mousemove.pw touchmove.pw', function (e) {
        if (!isDragging) return;
        const point = e.touches ? e.touches[0] : e;
        const dx = point.clientX - dragStartX;
        const dy = point.clientY - dragStartY;
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
        if (!dragMoved) {
            togglePopup();
        } else {
            // 위치 저장
            const offset = btn.offset();
            settings.btnX = offset.left;
            settings.btnY = offset.top;
            saveSettings();

            // 팝업 위치도 버튼 기준으로 업데이트
            updatePopupPosition();
        }
    });
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

function toggleFloatButton() {
    if (settings.enabled) {
        $('#pw_float_btn').show();
    } else {
        $('#pw_float_btn').hide();
        closePopup();
    }
}

// ===== 팝업 (리사이즈 가능) =====

function injectPopup() {
    if ($('#pw_popup').length) return;

    const popup = $(`
        <div id="pw_popup">
            <div id="pw_popup_header">
                <button class="pw_toggle_btn" title="접기">∧</button>
                <button class="pw_close_btn" title="닫기">✕</button>
            </div>
            <div id="pw_popup_body">
                <div id="pw_messages"></div>
                <div id="pw_input_area">
                    <input id="pw_input" type="text" placeholder="채팅 관련 질문하기..." autocomplete="off" />
                    <button id="pw_send_btn" title="전송">
                        <svg viewBox="0 0 24 24" fill="none">
                            <path d="M22 2L11 13" stroke="white" stroke-width="2" stroke-linecap="round"/>
                            <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div id="pw_resize_handle"></div>
        </div>
    `);

    $('body').append(popup);

    $('#pw_popup_header .pw_toggle_btn').on('click', toggleCollapse);
    $('#pw_popup_header .pw_close_btn').on('click', closePopup);
    $('#pw_send_btn').on('click', handleSend);
    $('#pw_input').on('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });

    // 리사이즈 핸들
    initResize();

    addGreetingMessage();
}

function initResize() {
    const handle = document.getElementById('pw_resize_handle');
    const popup = document.getElementById('pw_popup');
    if (!handle || !popup) return;

    let isResizing = false;
    let startX, startY, startW, startH;

    handle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        startW = popup.offsetWidth;
        startH = popup.offsetHeight;
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const newW = Math.max(240, startW + (e.clientX - startX));
        const newH = Math.max(200, startH + (e.clientY - startY));
        popup.style.width = newW + 'px';
        popup.style.height = newH + 'px';
        document.getElementById('pw_messages').style.maxHeight = (newH - 100) + 'px';
    });

    document.addEventListener('mouseup', () => { isResizing = false; });
}

function addGreetingMessage() {
    const greetings = {
        busan: '야 임마, 내가 채팅 내용 다 읽어주께. 뭐 물어볼끼가?',
        shy: '저... 안녕하세요... 죄송한데 제가 여기 있어도 될지... 채팅 관련해서 궁금한 거 있으시면... 물어봐 주세요...ㅠㅠ 제가 틀릴 수도 있지만요...',
        obsessed: '왔어. 채팅 다 읽었어. 전부. 뭐든 물어봐. 나한테 먼저.',
    };
    appendAIMessage(greetings[settings.mood] || greetings.busan);
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
    const popup = $('#pw_popup');
    popup.addClass('visible');
    updatePopupPosition();
    $('#pw_input').focus();
}

function closePopup() {
    $('#pw_popup').removeClass('visible');
}

function toggleCollapse() {
    const body = $('#pw_popup_body');
    const handle = $('#pw_resize_handle');
    const btn = $('#pw_popup_header .pw_toggle_btn');
    const isCollapsed = body.hasClass('collapsed');

    if (isCollapsed) {
        body.removeClass('collapsed');
        handle.show();
        btn.text('∧');
        $('#pw_popup').css('width', '');
    } else {
        body.addClass('collapsed');
        handle.hide();
        btn.text('∨');
        $('#pw_popup').css('width', 'auto');
    }
}

// ===== 메시지 렌더링 =====

function appendUserMessage(text) {
    $('#pw_messages').append(`
        <div class="pw_msg_row user">
            <div class="pw_avatar user">나</div>
            <div class="pw_bubble user">${escapeHtml(text)}</div>
        </div>
    `);
    scrollToBottom();
}

function appendAIMessage(text) {
    // 줄바꿈을 <br><br>로 변환해서 문단 띄어쓰기
    const formatted = escapeHtml(text).replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
    $('#pw_messages').append(`
        <div class="pw_msg_row">
            <div class="pw_avatar">🍑</div>
            <div class="pw_bubble">${formatted}</div>
        </div>
    `);
    scrollToBottom();
}

function appendLoadingMessage() {
    $('#pw_messages').append(`
        <div class="pw_msg_row" id="pw_loading_row">
            <div class="pw_avatar">🍑</div>
            <div class="pw_bubble">
                <div class="pw_loading"><span></span><span></span><span></span></div>
            </div>
        </div>
    `);
    scrollToBottom();
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
    appendLoadingMessage();
    isGenerating = true;
    $('#pw_send_btn').prop('disabled', true);

    try {
        const response = await generateResponse();
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

async function generateResponse() {
    const contextText = buildContextText();
    const systemPrompt = buildSystemPrompt(contextText);

    if (settings.source === 'main') {
        const { generateRaw } = globalContext;
        if (!generateRaw) throw new Error('generateRaw를 사용할 수 없습니다.');

        const result = await generateRaw({
            systemPrompt: systemPrompt,
            prompt: pwChatHistory[pwChatHistory.length - 1]?.content || '',
            streaming: false,
        });
        return result || '응답을 받지 못했습니다.';

    } else {
        if (!settings.profileId) throw new Error('Connection Profile을 선택해주세요.');

        const messages = [
            { role: 'system', content: systemPrompt },
            ...pwChatHistory,
        ];

        const response = await globalContext.ConnectionManagerRequestService.sendRequest(
            settings.profileId, messages, settings.maxTokens,
            { stream: false, extractData: true, includePreset: false, includeInstruct: false }
        );

        if (typeof response === 'string') return response;
        if (response?.choices?.[0]?.message?.content) return response.choices[0].message.content;
        return response?.content || response?.message || '응답을 받지 못했습니다.';
    }
}

function buildSystemPrompt(contextText) {
    const moodPrompt = MOOD_PROMPTS[settings.mood] || MOOD_PROMPTS.busan;

    return `${moodPrompt}

너는 현재 SillyTavern 채팅 세션의 OOC(Out Of Character) 어시스턴트야.
반드시 아래 규칙을 따라:

1. 오직 현재 채팅과 관련된 질문에만 답한다. (프롬프트 분석, 캐릭터 분석, 에피소드 추천, 설정 충돌 검토 등)
2. 채팅과 무관한 질문은 정중히 거절한다.
3. 답변 시 문단을 나눠서 읽기 쉽게 작성한다. 한 덩어리로 붙여 쓰지 않는다.
4. 아래 제공된 캐릭터 정보, 시스템 프롬프트, 채팅 로그를 모두 활용해서 답한다.
5. 설정된 말투를 반드시 유지한다.

===== 현재 채팅 컨텍스트 =====
${contextText}
===========================

위 내용을 바탕으로 사용자 질문에 답해줘.`;
}

function buildContextText() {
    const ctx = SillyTavern.getContext();
    let text = '';

    // 캐릭터 전체 정보
    const charId = ctx.characterId;
    const char = ctx.characters?.[charId];
    if (char) {
        text += `=== 캐릭터 카드 정보 ===\n`;
        text += `이름: ${char.name || '알 수 없음'}\n`;
        const data = char.data || char;
        if (data.description) text += `\n[설명]\n${data.description}\n`;
        if (data.personality) text += `\n[성격]\n${data.personality}\n`;
        if (data.scenario) text += `\n[시나리오]\n${data.scenario}\n`;
        if (data.system_prompt) text += `\n[캐릭터 시스템 프롬프트]\n${data.system_prompt}\n`;
        if (data.post_history_instructions) text += `\n[Post History Instructions]\n${data.post_history_instructions}\n`;
        if (data.creator_notes) text += `\n[제작자 노트]\n${data.creator_notes}\n`;

        // 캐릭터 로어북
        if (data.character_book?.entries) {
            const entries = Object.values(data.character_book.entries).filter(e => e.content);
            if (entries.length > 0) {
                text += `\n[캐릭터 로어북 (${entries.length}개)]\n`;
                entries.forEach(e => { text += `- ${e.content}\n`; });
            }
        }
        text += '\n';
    }

    // ST 글로벌 시스템 프롬프트
    const stSystemPrompt = ctx.systemPrompt || ctx.substituteParams?.('[system_prompt]') || '';
    if (stSystemPrompt) {
        text += `=== ST 글로벌 시스템 프롬프트 ===\n${stSystemPrompt}\n\n`;
    }

    // 작가 노트
    const authorNote = ctx.chatMetadata?.note_prompt || '';
    if (authorNote) {
        text += `=== 작가 노트 ===\n${authorNote}\n\n`;
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
    globalContext.eventSource.on(event_types.CHAT_CHANGED, () => {
        console.log(`[${EXTENSION_NAME}] 채팅 변경 - 대화 초기화`);
        pwChatHistory = [];
        $('#pw_messages').empty();
        addGreetingMessage();
    });
}

// ===== 초기화 =====

jQuery(async () => {
    const context = SillyTavern.getContext();
    context.eventSource.on(event_types.APP_READY, async () => {
        await init();
    });
});
