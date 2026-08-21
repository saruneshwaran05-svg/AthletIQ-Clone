// AthletIQ AskAI Omnipresent Draggable Assistant & Voice Controller
let currentConversationId = null;
let isAskAiListening = false;
let isAskAiSpeaking = false;
let askAiSpeechRecognition = null;
let askAiVoiceEnabled = true;
let currentCoachFocusStudentId = null;
let isAskAiPanelOpen = false;

// -------------------------------------------------------------
// 1. DRAGGABLE FLOATING WIDGET & PANEL LOGIC
// -------------------------------------------------------------

function initAskAiDraggable() {
  const widget = document.getElementById('askai-floating-widget');
  const panel = document.getElementById('askai-floating-panel');
  const panelHeader = document.getElementById('askai-panel-header');

  // Restore saved widget position if available
  const savedPos = localStorage.getItem('athletiq_askai_widget_pos');
  if (savedPos && widget) {
    try {
      const pos = JSON.parse(savedPos);
      const maxX = window.innerWidth - widget.offsetWidth - 10;
      const maxY = window.innerHeight - widget.offsetHeight - 10;
      const left = Math.max(10, Math.min(pos.left, maxX));
      const top = Math.max(10, Math.min(pos.top, maxY));

      widget.style.left = `${left}px`;
      widget.style.top = `${top}px`;
      widget.style.right = 'auto';
      widget.style.bottom = 'auto';
    } catch (e) {}
  }

  // Make Floating Icon Draggable
  if (widget) {
    makeElementDraggable(widget, widget, (left, top) => {
      localStorage.setItem('athletiq_askai_widget_pos', JSON.stringify({ left, top }));
    });
  }

  // Make Floating Panel Header Draggable
  if (panel && panelHeader) {
    makeElementDraggable(panel, panelHeader);
  }
}

function makeElementDraggable(element, handle, onDragEnd) {
  let isDragging = false;
  let startX = 0, startY = 0;
  let initialLeft = 0, initialTop = 0;
  let hasMoved = false;

  const startDrag = (clientX, clientY) => {
    isDragging = true;
    hasMoved = false;
    startX = clientX;
    startY = clientY;

    const rect = element.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;

    // Convert from right/bottom to absolute left/top
    element.style.left = `${initialLeft}px`;
    element.style.top = `${initialTop}px`;
    element.style.right = 'auto';
    element.style.bottom = 'auto';
  };

  const onMove = (clientX, clientY) => {
    if (!isDragging) return;
    const dx = clientX - startX;
    const dy = clientY - startY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasMoved = true;
    }

    const maxX = window.innerWidth - element.offsetWidth - 8;
    const maxY = window.innerHeight - element.offsetHeight - 8;

    const newLeft = Math.max(8, Math.min(initialLeft + dx, maxX));
    const newTop = Math.max(8, Math.min(initialTop + dy, maxY));

    element.style.left = `${newLeft}px`;
    element.style.top = `${newTop}px`;
  };

  const endDrag = () => {
    if (isDragging) {
      isDragging = false;
      const rect = element.getBoundingClientRect();
      if (onDragEnd && hasMoved) {
        onDragEnd(rect.left, rect.top);
      }
    }
  };

  // Mouse events
  handle.addEventListener('mousedown', (e) => {
    // Ignore clicks on buttons inside handle
    if (e.target.closest('button') || e.target.closest('select')) return;
    startDrag(e.clientX, e.clientY);

    const onMouseMove = (ev) => onMove(ev.clientX, ev.clientY);
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      endDrag();
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  // Touch events (Mobile support)
  handle.addEventListener('touchstart', (e) => {
    if (e.target.closest('button') || e.target.closest('select')) return;
    const touch = e.touches[0];
    startDrag(touch.clientX, touch.clientY);

    const onTouchMove = (ev) => {
      const t = ev.touches[0];
      onMove(t.clientX, t.clientY);
    };
    const onTouchEnd = () => {
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      endDrag();
    };

    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd);
  }, { passive: true });
}

// Toggle Floating AskAI Assistant Panel
function toggleAskAiFloatingPanel(forceState = null) {
  const panel = document.getElementById('askai-floating-panel');
  if (!panel) return;

  const shouldOpen = forceState !== null ? forceState : panel.classList.contains('hidden');

  if (shouldOpen) {
    panel.classList.remove('hidden');
    // Animate in
    requestAnimationFrame(() => {
      panel.classList.remove('scale-95', 'opacity-0');
      panel.classList.add('scale-100', 'opacity-100');
    });
    isAskAiPanelOpen = true;
    loadAskAiView();
    setTimeout(() => {
      const input = document.getElementById('askai-input');
      if (input) input.focus();
    }, 200);
  } else {
    // Animate out
    panel.classList.remove('scale-100', 'opacity-100');
    panel.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
      panel.classList.add('hidden');
      isAskAiPanelOpen = false;
    }, 200);
  }

  if (window.lucide) lucide.createIcons();
}

// -------------------------------------------------------------
// 2. SPEECH RECOGNITION & SYNTHESIS CONTROLLER
// -------------------------------------------------------------

function initAskAiSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.info("Web Speech API Recognition is not supported on this browser.");
    return null;
  }

  try {
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      isAskAiListening = true;
      updateAskAiVoiceUI('listening');
    };

    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      const input = document.getElementById('askai-input');
      if (input) {
        input.value = finalTranscript || interimTranscript;
      }

      if (finalTranscript && finalTranscript.trim().length > 0) {
        updateAskAiVoiceUI('processing');
        setTimeout(() => {
          handleAskAiSubmit(null, true);
        }, 300);
      }
    };

    recognition.onerror = (event) => {
      console.warn("Speech recognition error:", event.error);
      isAskAiListening = false;
      updateAskAiVoiceUI('idle');
      if (event.error === 'not-allowed') {
        showToast("Microphone access was denied. You can continue using text chat.", "warning");
      }
    };

    recognition.onend = () => {
      isAskAiListening = false;
      if (!document.getElementById('askai-typing-indicator') || document.getElementById('askai-typing-indicator').classList.contains('hidden')) {
        updateAskAiVoiceUI('idle');
      }
    };

    return recognition;
  } catch (e) {
    console.warn("Could not initialize SpeechRecognition:", e);
    return null;
  }
}

function toggleAskAiVoiceRecording() {
  if (isAskAiSpeaking) {
    stopAskAiSpeech();
  }

  if (!askAiSpeechRecognition) {
    askAiSpeechRecognition = initAskAiSpeechRecognition();
  }

  if (!askAiSpeechRecognition) {
    showToast("Voice input is not supported in your browser. You can type in the chat box.", "info");
    const input = document.getElementById('askai-input');
    if (input) input.focus();
    return;
  }

  if (isAskAiListening) {
    askAiSpeechRecognition.stop();
    isAskAiListening = false;
    updateAskAiVoiceUI('idle');
  } else {
    try {
      const input = document.getElementById('askai-input');
      if (input) input.value = '';
      askAiSpeechRecognition.start();
    } catch (e) {
      console.warn("Speech recognition start failed:", e);
      try {
        askAiSpeechRecognition.stop();
      } catch (err) {}
      updateAskAiVoiceUI('idle');
    }
  }
}

function updateAskAiVoiceUI(state) {
  const statusBar = document.getElementById('askai-voice-status-bar');
  const statusIcon = document.getElementById('askai-voice-status-icon');
  const statusText = document.getElementById('askai-voice-status-text');
  const micBtn = document.getElementById('askai-mic-btn');
  const micPulse = document.getElementById('askai-mic-pulse');
  const stopSpeechBtn = document.getElementById('askai-stop-speech-btn');
  const floatingWave = document.getElementById('askai-floating-audio-wave');

  if (state === 'listening') {
    if (statusBar) statusBar.classList.remove('hidden');
    if (statusIcon) statusIcon.className = 'w-2 h-2 rounded-full bg-rose-500 animate-ping';
    if (statusText) statusText.textContent = 'Listening... Speak now';
    if (micBtn) micBtn.className = 'p-2 rounded-xl text-rose-500 bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-700 transition flex items-center justify-center relative flex-shrink-0';
    if (micPulse) micPulse.classList.remove('hidden');
    if (floatingWave) floatingWave.classList.remove('hidden');
  } else if (state === 'processing') {
    if (statusBar) statusBar.classList.remove('hidden');
    if (statusIcon) statusIcon.className = 'w-2 h-2 rounded-full bg-amber-500 animate-pulse';
    if (statusText) statusText.textContent = 'Analyzing performance...';
    if (micPulse) micPulse.classList.add('hidden');
    if (floatingWave) floatingWave.classList.remove('hidden');
  } else if (state === 'speaking') {
    if (statusBar) statusBar.classList.remove('hidden');
    if (statusIcon) statusIcon.className = 'w-2 h-2 rounded-full bg-emerald-500 animate-pulse';
    if (statusText) statusText.textContent = 'AthletIQ AI is speaking...';
    if (stopSpeechBtn) stopSpeechBtn.classList.remove('hidden');
    if (micPulse) micPulse.classList.add('hidden');
    if (floatingWave) floatingWave.classList.remove('hidden');
  } else {
    // idle
    if (statusBar) statusBar.classList.add('hidden');
    if (micBtn) micBtn.className = 'p-2 rounded-xl text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition flex items-center justify-center relative flex-shrink-0';
    if (micPulse) micPulse.classList.add('hidden');
    if (stopSpeechBtn) stopSpeechBtn.classList.add('hidden');
    if (floatingWave) floatingWave.classList.add('hidden');
  }

  if (window.lucide) lucide.createIcons();
}

function speakAskAiResponse(text) {
  if (!askAiVoiceEnabled || !window.speechSynthesis) return;

  try {
    window.speechSynthesis.cancel();

    const cleanSpeech = text
      .replace(/[#*_`~>-]/g, ' ')
      .replace(/\[.*?\]/g, '')
      .replace(/\(.*?\)/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanSpeech) return;

    const utterance = new SpeechSynthesisUtterance(cleanSpeech);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.lang = 'en-US';

    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Alex')) && v.lang.startsWith('en'));
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onstart = () => {
      isAskAiSpeaking = true;
      updateAskAiVoiceUI('speaking');
    };

    utterance.onend = () => {
      isAskAiSpeaking = false;
      updateAskAiVoiceUI('idle');
    };

    utterance.onerror = () => {
      isAskAiSpeaking = false;
      updateAskAiVoiceUI('idle');
    };

    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.warn("Speech synthesis failed:", e);
    isAskAiSpeaking = false;
    updateAskAiVoiceUI('idle');
  }
}

function stopAskAiSpeech() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  isAskAiSpeaking = false;
  updateAskAiVoiceUI('idle');
}

function toggleAskAiSpeechAudio() {
  askAiVoiceEnabled = !askAiVoiceEnabled;
  localStorage.setItem('athletiq_voice_enabled', askAiVoiceEnabled ? 'true' : 'false');
  updateVoiceToggleButtonUI();

  if (!askAiVoiceEnabled) {
    stopAskAiSpeech();
    showToast("Voice audio speech output disabled", "info");
  } else {
    showToast("Voice audio speech output enabled", "success");
  }
}

function updateVoiceToggleButtonUI() {
  const btn = document.getElementById('askai-voice-tts-btn');
  const icon = document.getElementById('askai-tts-icon');

  if (!btn) return;

  if (askAiVoiceEnabled) {
    btn.className = 'p-1.5 rounded-lg border border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 transition flex items-center';
    if (icon) icon.setAttribute('data-lucide', 'volume-2');
  } else {
    btn.className = 'p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700/60 text-slate-400 dark:text-slate-400 transition flex items-center';
    if (icon) icon.setAttribute('data-lucide', 'volume-x');
  }
  if (window.lucide) lucide.createIcons();
}

// -------------------------------------------------------------
// 3. CHAT CONVERSATION VIEW & SUBMISSIONS
// -------------------------------------------------------------

async function loadAskAiView() {
  if (!currentUser) return;

  const role = (currentUser.role || 'STUDENT').toUpperCase();
  const personaBadge = document.getElementById('askai-panel-persona-badge');
  const coachWrapper = document.getElementById('askai-coach-student-wrapper');
  const greetingHeading = document.getElementById('askai-greeting-heading');

  const savedVoice = localStorage.getItem('athletiq_voice_enabled');
  if (savedVoice !== null) {
    askAiVoiceEnabled = savedVoice === 'true';
  }
  updateVoiceToggleButtonUI();

  if (role === 'COACH') {
    if (personaBadge) {
      personaBadge.textContent = 'Coach Assistant';
      personaBadge.className = 'px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 truncate';
    }
    if (coachWrapper) coachWrapper.classList.remove('hidden');
    if (greetingHeading) greetingHeading.textContent = `Hello Coach ${currentUser.name}!`;
    await populateAskAiCoachStudents();
  } else {
    if (personaBadge) {
      personaBadge.textContent = 'Student Coach';
      personaBadge.className = 'px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-brand-100 dark:bg-brand-900/60 text-brand-700 dark:text-brand-300 truncate';
    }
    if (coachWrapper) coachWrapper.classList.add('hidden');
    if (greetingHeading) greetingHeading.textContent = `Hi ${currentUser.name}! I'm your AthletIQ AI.`;
  }

  renderAskAiQuickActions(role);

  if (!currentConversationId) {
    await loadRecentOrNewConversation();
  } else {
    await fetchAndRenderConversationMessages(currentConversationId);
  }

  if (window.lucide) lucide.createIcons();
}

async function populateAskAiCoachStudents() {
  const select = document.getElementById('askai-coach-student-select');
  if (!select) return;

  try {
    const res = await fetch('/api/coach/students', { headers: authHeaders() });
    if (res.ok) {
      const students = await res.json();
      select.innerHTML = '<option value="">All Connected Students</option>';
      students.forEach(st => {
        const opt = document.createElement('option');
        opt.value = st.student_id;
        opt.textContent = `${st.name} (${st.preferred_sport || 'Sports'})`;
        if (currentCoachFocusStudentId && String(st.student_id) === String(currentCoachFocusStudentId)) {
          opt.selected = true;
        }
        select.appendChild(opt);
      });
    }
  } catch (e) {
    console.warn("Failed to load coach students for selector:", e);
  }
}

function onAskAiCoachStudentChange(studentId) {
  currentCoachFocusStudentId = studentId ? parseInt(studentId) : null;
  const optName = studentId ? document.getElementById('askai-coach-student-select').selectedOptions[0].text : 'All Connected Students';
  showToast(`Focus set to: ${optName}`, 'info');
  renderAskAiQuickActions('COACH');
}

function renderAskAiQuickActions(role) {
  const bar = document.getElementById('askai-quick-actions-bar');
  if (!bar) return;

  let actions = [];
  if (role === 'STUDENT') {
    actions = [
      { label: "Analyze Performance", prompt: "How am I performing in my sport?" },
      { label: "Training Plan", prompt: "Give me a 30-minute practice plan for today" },
      { label: "Find Weakness", prompt: "What is my biggest weakness and struggle area?" },
      { label: "Check Goals", prompt: "Am I close to achieving my goals?" },
      { label: "Review Coach Feedback", prompt: "Summarize my coach feedback and recommended drills" }
    ];
  } else {
    actions = [
      { label: "Who Needs Attention?", prompt: "Which of my students needs the most attention right now?" },
      { label: "Summarize Students", prompt: "Summarize my connected students recent practice and performance" },
      { label: "Find Team Weaknesses", prompt: "What are the most frequent weaknesses logged by my athletes?" },
      { label: "Create Training Plan", prompt: "Suggest a training plan and drills for my athletes" }
    ];
  }

  bar.innerHTML = `
    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex-shrink-0 flex items-center space-x-1 pl-1">
      <i data-lucide="sparkles" class="w-3 h-3 text-accent-500"></i>
      <span>Ask:</span>
    </span>
  `;

  actions.forEach(a => {
    bar.innerHTML += `
      <button type="button" onclick="sendAskAiQuickPrompt('${a.prompt.replace(/'/g, "\\'")}')"
        class="px-2.5 py-1 rounded-xl bg-white hover:bg-brand-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold whitespace-nowrap transition shadow-sm">
        ${a.label}
      </button>
    `;
  });

  if (window.lucide) lucide.createIcons();
}

function sendAskAiQuickPrompt(promptText) {
  const input = document.getElementById('askai-input');
  if (input) {
    input.value = promptText;
  }
  handleAskAiSubmit();
}

function openAskAiWithPrompt(promptText) {
  toggleAskAiFloatingPanel(true);
  setTimeout(() => {
    const input = document.getElementById('askai-input');
    if (input) input.value = promptText;
    handleAskAiSubmit();
  }, 200);
}

async function startNewAskAiConversation() {
  currentConversationId = null;
  const list = document.getElementById('askai-messages-list');
  if (list) list.innerHTML = '';
  const input = document.getElementById('askai-input');
  if (input) input.value = '';
  stopAskAiSpeech();
  showToast("Started fresh conversation", "info");
}

async function clearAllAskAiHistory() {
  if (!confirm("Are you sure you want to clear all AskAI history?")) return;
  try {
    await fetch('/api/ai/conversations/clear', {
      method: 'POST',
      headers: authHeaders()
    });
    currentConversationId = null;
    const list = document.getElementById('askai-messages-list');
    if (list) list.innerHTML = '';
    showToast("Conversations cleared", "success");
  } catch (e) {
    showToast("Failed to clear history", "error");
  }
}

async function loadRecentOrNewConversation() {
  try {
    const res = await fetch('/api/ai/conversations', { headers: authHeaders() });
    if (res.ok) {
      const convs = await res.json();
      if (convs && convs.length > 0) {
        currentConversationId = convs[0].conversation_id;
        await fetchAndRenderConversationMessages(currentConversationId);
      }
    }
  } catch (e) {
    console.warn("Could not load conversations:", e);
  }
}

async function fetchAndRenderConversationMessages(convId) {
  const list = document.getElementById('askai-messages-list');
  if (!list) return;

  try {
    const res = await fetch(`/api/ai/conversations/${convId}/messages`, { headers: authHeaders() });
    if (res.ok) {
      const messages = await res.json();
      list.innerHTML = '';
      messages.forEach(m => {
        appendAskAiMessageBubble(m.sender, m.message, m.sources, m.suggested_questions, false);
      });
      scrollAskAiToBottom();
    }
  } catch (e) {
    console.warn("Failed to load messages:", e);
  }
}

async function handleAskAiSubmit(event, isVoiceMode = false) {
  if (event) event.preventDefault();

  const input = document.getElementById('askai-input');
  if (!input) return;

  const rawMessage = input.value.trim();
  if (!rawMessage) return;

  input.value = '';
  appendAskAiMessageBubble('user', rawMessage, [], [], false);
  scrollAskAiToBottom();

  const indicator = document.getElementById('askai-typing-indicator');
  if (indicator) indicator.classList.remove('hidden');
  updateAskAiVoiceUI('processing');
  scrollAskAiToBottom();

  const sendBtn = document.getElementById('askai-send-btn');
  if (sendBtn) sendBtn.disabled = true;

  try {
    const payload = {
      message: rawMessage,
      conversation_id: currentConversationId,
      student_id: currentCoachFocusStudentId,
      voice_mode: isVoiceMode
    };

    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "AskAI was unable to process your request.");
    }

    currentConversationId = data.conversation_id;

    if (indicator) indicator.classList.add('hidden');
    updateAskAiVoiceUI('idle');

    appendAskAiMessageBubble('assistant', data.message, data.sources, data.suggested_questions, true);
    scrollAskAiToBottom();

    if (askAiVoiceEnabled) {
      speakAskAiResponse(data.message);
    }
  } catch (err) {
    if (indicator) indicator.classList.add('hidden');
    updateAskAiVoiceUI('idle');
    appendAskAiMessageBubble('assistant', `⚠️ **Error:** ${err.message || 'Could not reach AthletIQ AI service.'}`, [], [], false);
    showToast(err.message || "Failed to get AI response", "error");
    scrollAskAiToBottom();
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
}

function appendAskAiMessageBubble(sender, messageText, sources = [], suggestedQuestions = [], isNew = false) {
  const container = document.getElementById('askai-messages-list');
  if (!container) return;

  const bubble = document.createElement('div');

  if (sender === 'user') {
    const userInitial = (currentUser && currentUser.name) ? currentUser.name.charAt(0).toUpperCase() : 'U';
    bubble.className = 'flex items-start justify-end space-x-2 max-w-[90%] ml-auto animate-fade-in';
    bubble.innerHTML = `
      <div class="bg-gradient-to-r from-brand-600 to-indigo-600 text-white p-3 rounded-2xl rounded-tr-none text-xs font-medium shadow-sm leading-relaxed whitespace-pre-wrap">
        ${escapeAskAiHtml(messageText)}
      </div>
      <div class="w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-900/50 text-brand-700 dark:text-brand-300 font-bold flex items-center justify-center text-xs flex-shrink-0">
        ${userInitial}
      </div>
    `;
  } else {
    const formattedHtml = formatAskAiMarkdown(messageText);

    let sourcesHtml = '';
    if (sources && sources.length > 0) {
      const sourceBadges = sources.map(s => `
        <span class="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[9px] font-bold border border-slate-200 dark:border-slate-700 flex items-center space-x-0.5">
          <i data-lucide="database" class="w-2.5 h-2.5 text-brand-500"></i>
          <span>${s}</span>
        </span>
      `).join('');

      sourcesHtml = `
        <div class="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center flex-wrap gap-1">
          <span class="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider">Grounding:</span>
          ${sourceBadges}
        </div>
      `;
    }

    let suggestionsHtml = '';
    if (suggestedQuestions && suggestedQuestions.length > 0) {
      const chips = suggestedQuestions.map(q => `
        <button type="button" onclick="sendAskAiQuickPrompt('${q.replace(/'/g, "\\'")}')"
          class="px-2 py-1 rounded-lg bg-brand-50 dark:bg-brand-950/40 hover:bg-brand-100 text-brand-700 dark:text-brand-300 border border-brand-200/80 dark:border-brand-800 text-[10px] font-semibold text-left transition flex items-center space-x-1">
          <i data-lucide="arrow-right" class="w-2.5 h-2.5 text-brand-500 flex-shrink-0"></i>
          <span>${q}</span>
        </button>
      `).join('');

      suggestionsHtml = `
        <div class="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
          <div class="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center space-x-1">
            <i data-lucide="sparkles" class="w-2.5 h-2.5 text-accent-500"></i>
            <span>Follow-up:</span>
          </div>
          <div class="flex flex-wrap gap-1">
            ${chips}
          </div>
        </div>
      `;
    }

    const uniqueMsgId = `msg_${Date.now()}_${Math.floor(Math.random()*1000)}`;

    bubble.className = 'flex items-start space-x-2 max-w-[95%] mr-auto animate-fade-in group';
    bubble.innerHTML = `
      <div class="w-7 h-7 rounded-xl bg-gradient-to-tr from-brand-600 via-indigo-600 to-accent-500 text-white flex items-center justify-center flex-shrink-0 shadow-sm mt-0.5">
        <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
      </div>
      <div class="flex-1 bg-slate-50 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl rounded-tl-none p-3 text-slate-800 dark:text-slate-100 text-xs shadow-sm space-y-1.5 relative">
        
        <div class="absolute top-2 right-2 flex items-center space-x-0.5 opacity-70 hover:opacity-100 transition">
          <button onclick="speakAskAiResponse(document.getElementById('${uniqueMsgId}').innerText)" 
            class="p-1 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition" 
            title="Read aloud">
            <i data-lucide="volume-2" class="w-3 h-3"></i>
          </button>
          <button onclick="copyAskAiText('${uniqueMsgId}')" 
            class="p-1 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition" 
            title="Copy text">
            <i data-lucide="copy" class="w-3 h-3"></i>
          </button>
        </div>

        <div id="${uniqueMsgId}" class="askai-markdown-content leading-relaxed space-y-1 pr-10">
          ${formattedHtml}
        </div>

        ${sourcesHtml}
        ${suggestionsHtml}
      </div>
    `;
  }

  container.appendChild(bubble);
  if (window.lucide) lucide.createIcons();
}

function copyAskAiText(elementId) {
  const el = document.getElementById(elementId);
  if (el) {
    navigator.clipboard.writeText(el.innerText).then(() => {
      showToast("Copied to clipboard", "success");
    }).catch(() => {
      showToast("Could not copy text", "warning");
    });
  }
}

function scrollAskAiToBottom() {
  const chatArea = document.getElementById('askai-chat-area');
  if (chatArea) {
    setTimeout(() => {
      chatArea.scrollTop = chatArea.scrollHeight;
    }, 50);
  }
}

function escapeAskAiHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatAskAiMarkdown(text) {
  if (!text) return '';

  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/^•\s+(.*)$/gm, '<li class="ml-3 list-disc">$1</li>');
  html = html.replace(/^\d+\.\s+(.*)$/gm, '<li class="ml-3 list-decimal">$1</li>');
  html = html.replace(/^>\s+(.*)$/gm, '<blockquote class="border-l-2 border-brand-500 pl-2 italic text-slate-500 my-1">$1</blockquote>');
  html = html.replace(/\n\n/g, '<div class="h-1.5"></div>');
  html = html.replace(/\n/g, '<br/>');

  return html;
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initAskAiDraggable();
});
