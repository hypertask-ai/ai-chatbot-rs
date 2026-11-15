import { launcherCopy, widgetCopy } from "./copy.js";
import {
  dockCollapsedValue,
  hostStorageKeys,
  proactiveDismissPrefix,
} from "./storage.js";
import { articleBubbles } from "./suggestions.js";
import { widgetLayout, widgetTheme } from "./theme.js";

type ScriptValue =
  | number
  | string
  | Readonly<Record<string, string>>
  | Readonly<Record<string, Readonly<Record<string, string>>>>;

const json = (value: ScriptValue): string => JSON.stringify(value);

export const widgetLoaderScript = (baseUrl: string): string =>
  String.raw`(function() {
  if (window.ChatWidgetLoaded) return;
  window.ChatWidgetLoaded = true;

  var NORMAL_HEIGHT = ${json(widgetLayout.normalHeight)};
  var NORMAL_WIDTH = ${json(widgetLayout.normalWidth)};
  var EXPANDED_HEIGHT = ${json(widgetLayout.expandedHeight)};
  var EXPANDED_WIDTH = ${json(widgetLayout.expandedWidth)};
  var BUBBLE_SIZE = ${json(widgetLayout.launcherSize)};
  var CHAT_BOTTOM = ${json(widgetLayout.chatBottom)};
  var MOBILE_BREAKPOINT = ${json(widgetLayout.mobileBreakpoint)};
  var HELP_BREAKPOINT = ${json(widgetLayout.helpBreakpoint)};
  var DOCK_WIDTH = ${json(widgetLayout.dockWidth)};
  var DOCK_COLLAPSE_KEY = ${json(hostStorageKeys.dockCollapsed)};
  var HOST_CONV_KEY = ${json(hostStorageKeys.conversation)};
  var HOST_VISITOR_KEY = ${json(hostStorageKeys.visitor)};
  var HOST_SECRET_KEY = ${json(hostStorageKeys.visitorSecret)};
  var THEME = ${json(widgetTheme)};

  var isExpanded = false;
  var scriptEl = document.currentScript;
  var dockMode = !!(scriptEl && scriptEl.getAttribute('data-mode') === 'docked');

  function storageGet(key) {
    try { return localStorage.getItem(key) || ''; } catch (err) { return ''; }
  }
  function storageSet(key, value) {
    try {
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    } catch (err) {}
  }
  function currentPage() {
    var url = '';
    var title = '';
    try { url = String(location.href || ''); } catch (err) { url = ''; }
    try { title = String(document.title || ''); } catch (err) { title = ''; }
    if (url.length > 500) url = url.slice(0, 500);
    if (title.length > 180) title = title.slice(0, 180);
    return { pageUrl: url, pageTitle: title };
  }

  var dockCollapsed = dockMode && storageGet(DOCK_COLLAPSE_KEY) === ${json(dockCollapsedValue(true))};

  if (dockMode && document.head) {
    var dockCss = document.createElement('style');
    dockCss.setAttribute('data-hypertask-chat', 'dock');
    dockCss.textContent = 'body.hypertask-chat-docked{width:auto;margin-right:var(--hypertask-chat-dock-width,' + DOCK_WIDTH + 'px);}';
    document.head.appendChild(dockCss);
  }

  function isMobile() {
    return window.innerWidth <= MOBILE_BREAKPOINT;
  }

  var articleMatch = window.location.pathname.match(/^\/help\/([^\/]+)$/);
  var articleSlug = articleMatch ? articleMatch[1] : null;
  var helpMount = document.getElementById('help-chat-mount');
  function helpIsNarrow() { return window.innerWidth < HELP_BREAKPOINT; }
  function usePinned() { return !!helpMount && !helpIsNarrow(); }
  function useDock() { return dockMode && !helpMount && window.innerWidth >= HELP_BREAKPOINT; }
  function sheetMode() { return helpMount ? helpIsNarrow() : (useDock() ? false : isMobile()); }

  var articleSuggestions = ${json(Object.fromEntries(articleBubbles))};

  var iframe = document.createElement('iframe');
  iframe.id = 'chat-widget-iframe';
  var chatParams = [];
  if (helpMount) chatParams.push('context=help');
  if (usePinned()) chatParams.push('pinned=1');
  else if (articleSlug) chatParams.push('article=' + encodeURIComponent(articleSlug));
  if (dockMode) {
    chatParams.push('dock=1');
    var bootPage = currentPage();
    if (bootPage.pageUrl) chatParams.push('pageUrl=' + encodeURIComponent(bootPage.pageUrl));
    if (bootPage.pageTitle) chatParams.push('pageTitle=' + encodeURIComponent(bootPage.pageTitle));
  }
  if (useDock() && !dockCollapsed) chatParams.push('docked=1');
  var chatQuery = chatParams.length ? '?' + chatParams.join('&') : '';
  var iframeStarted = false;
  var iframeLoaded = false;
  var pendingSuggestion = '';
  var pendingAttachment = '';
  window.HypertaskHelp = {
    open: function(options) {
      options = options || {};
      openChat();
      if (options.message) {
        if (iframeLoaded) tellChat({ type: 'send-suggestion', message: options.message });
        else pendingSuggestion = options.message;
      }
      if (options.attachment) {
        if (iframeLoaded) tellChat({ type: 'help-attachment', dataUrl: options.attachment });
        else pendingAttachment = options.attachment;
      }
    }
  };
  function startIframe() {
    if (iframeStarted) return;
    iframeStarted = true;
    iframe.src = ${json(baseUrl)} + '/widget/chat' + chatQuery;
  }

  function setDesktopStyles() {
    iframe.style.cssText = 'position:fixed;bottom:' + CHAT_BOTTOM + ';right:24px;width:' + (isExpanded ? EXPANDED_WIDTH : NORMAL_WIDTH) + ';height:' + (isExpanded ? EXPANDED_HEIGHT : NORMAL_HEIGHT) + ';border:1px solid #303036;border-radius:16px;box-shadow:0 24px 64px rgba(0,0,0,0.6);z-index:999999;display:' + (isOpen ? 'block' : 'none') + ';transition:width 0.2s ease, height 0.2s ease;background:' + THEME.chatBg + ';';
  }

  function setMobileStyles() {
    var vv = window.visualViewport;
    var top = vv ? vv.offsetTop : 0;
    var height = vv ? vv.height : window.innerHeight;
    var width = vv ? Math.min(vv.width, window.innerWidth) : window.innerWidth;
    iframe.style.cssText = 'position:fixed;top:' + top + 'px;left:0;width:' + width + 'px;height:' + height + 'px;max-width:100%;border:none;border-radius:0;box-shadow:none;z-index:999999;display:' + (isOpen ? 'block' : 'none') + ';background:' + THEME.chatBg + ';';
  }

  function setDockStyles() {
    var shown = !dockCollapsed;
    iframe.style.cssText = 'position:fixed;top:0;right:0;width:' + DOCK_WIDTH + 'px;height:100vh;height:100dvh;border:none;border-left:1px solid ' + THEME.chatBorder + ';border-radius:0;box-shadow:none;z-index:999999;display:' + (shown ? 'block' : 'none') + ';background:' + THEME.chatBg + ';';
  }

  function updateIframeStyles() {
    if (usePinned()) {
      iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:none;border-radius:0;box-shadow:none;display:block;background:' + THEME.chatBg + ';';
      return;
    }
    if (useDock()) {
      setDockStyles();
      return;
    }
    if (sheetMode()) {
      setMobileStyles();
    } else {
      setDesktopStyles();
    }
  }

  function tellChat(message) {
    if (iframeStarted && iframe.contentWindow) iframe.contentWindow.postMessage(message, '*');
  }

  var btn = document.createElement('button');
  btn.id = 'chat-widget-btn';
  var chatIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
  var chevronIcon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
  btn.innerHTML = chatIcon;
  btn.setAttribute('aria-label', ${json(widgetCopy.launcherLabel)});
  btn.style.cssText = 'position:fixed;bottom:max(24px, env(safe-area-inset-bottom));right:max(24px, env(safe-area-inset-right));width:' + BUBBLE_SIZE + ';height:' + BUBBLE_SIZE + ';border-radius:50%;background:#18181b;color:#f4f4f7;border:1px solid #303036;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(0,0,0,0.5);z-index:1000000;transition:transform 0.2s, background 0.2s, color 0.2s;font-family:' + THEME.fontBody + ';';

  btn.onmouseover = function() { btn.style.transform = 'scale(1.05)'; };
  btn.onmouseout = function() { btn.style.transform = 'scale(1)'; };

  function updateButtonStyle() {
    if (isOpen) {
      if (sheetMode()) {
        btn.style.display = 'none';
      } else {
        btn.style.display = 'flex';
        btn.innerHTML = chevronIcon;
        btn.style.background = '#18181b';
        btn.style.color = '#f4f4f7';
        btn.style.boxShadow = '0 8px 24px rgba(0,0,0,0.5)';
      }
    } else {
      btn.style.display = 'flex';
      btn.innerHTML = chatIcon;
      btn.style.background = '#18181b';
      btn.style.color = '#f4f4f7';
      btn.style.boxShadow = '0 8px 24px rgba(0,0,0,0.5)';
    }
  }

  var originalBodyOverflow = '';
  var originalBodyPosition = '';
  var originalBodyTop = '';
  var originalBodyWidth = '';
  var scrollPosition = 0;

  function lockBodyScroll() {
    if (!sheetMode()) return;
    scrollPosition = window.pageYOffset;
    originalBodyOverflow = document.body.style.overflow;
    originalBodyPosition = document.body.style.position;
    originalBodyTop = document.body.style.top;
    originalBodyWidth = document.body.style.width;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = '-' + scrollPosition + 'px';
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
  }

  function unlockBodyScroll() {
    if (document.body.style.position !== 'fixed') return;
    document.documentElement.style.overflow = '';
    document.body.style.overflow = originalBodyOverflow;
    document.body.style.position = originalBodyPosition;
    document.body.style.top = originalBodyTop;
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = originalBodyWidth;
    window.scrollTo(0, scrollPosition);
  }

  var isOpen = useDock() && !dockCollapsed;

  var dockHideIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"></polyline></svg>';
  var dockShowIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 6 9 12 15 18"></polyline></svg>';
  var dockToggle = document.createElement('button');
  dockToggle.id = 'chat-widget-dock-toggle';
  dockToggle.type = 'button';
  dockToggle.setAttribute('aria-controls', 'chat-widget-iframe');
  dockToggle.style.cssText = 'position:fixed;top:50%;transform:translateY(-50%);width:22px;height:48px;border-radius:8px 0 0 8px;border:1px solid ' + THEME.chatBorder + ';border-right:none;background:' + THEME.chatBg + ';color:' + THEME.htInk + ';cursor:pointer;display:none;align-items:center;justify-content:center;padding:0;z-index:1000001;font-family:' + THEME.fontBody + ';';

  function syncDockHost() {
    var open = useDock() && !dockCollapsed;
    document.documentElement.classList.toggle('hypertask-chat-docked', open);
    if (document.body) document.body.classList.toggle('hypertask-chat-docked', open);
    if (dockMode) {
      document.documentElement.style.setProperty('--hypertask-chat-dock-width', open ? (DOCK_WIDTH + 'px') : '0px');
    }
    if (!useDock()) {
      dockToggle.style.display = 'none';
      return;
    }
    dockToggle.style.display = 'flex';
    dockToggle.style.right = dockCollapsed ? '0px' : ((DOCK_WIDTH - 22) + 'px');
    dockToggle.innerHTML = dockCollapsed ? dockShowIcon : dockHideIcon;
    dockToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    dockToggle.setAttribute('aria-label', dockCollapsed ? ${json(launcherCopy.expandLabel)} : ${json(launcherCopy.collapseLabel)});
  }

  function setDockCollapsed(next) {
    dockCollapsed = !!next;
    storageSet(DOCK_COLLAPSE_KEY, dockCollapsed ? ${json(dockCollapsedValue(true))} : ${json(dockCollapsedValue(false))});
    if (useDock()) isOpen = !dockCollapsed;
    updateIframeStyles();
    syncDockHost();
    sendDockState();
  }

  dockToggle.onclick = function() {
    setDockCollapsed(!dockCollapsed);
  };

  function closeChat() {
    if (usePinned() || useDock()) return;
    isOpen = false;
    updateIframeStyles();
    updateButtonStyle();
    unlockBodyScroll();
    tellChat({ type: 'chat-widget-closed' });
  }

  function openChat() {
    if (proactiveBubble) proactiveBubble.style.display = 'none';
    startIframe();
    if (!iframe.parentElement) document.body.appendChild(iframe);
    isOpen = true;
    updateIframeStyles();
    updateButtonStyle();
    lockBodyScroll();
    tellChat({ type: 'chat-widget-opened', isMobile: sheetMode(), pinned: usePinned(), docked: useDock() });
    tellChat({ type: 'chat-viewport-fit' });
    sendPageContext();
  }

  function sendPageContext() {
    if (!dockMode) return;
    var page = currentPage();
    tellChat({ type: 'chat-widget-page', pageUrl: page.pageUrl, pageTitle: page.pageTitle });
  }

  function sendBoot() {
    var page = dockMode ? currentPage() : { pageUrl: '', pageTitle: '' };
    tellChat({
      type: 'chat-widget-boot',
      conversationId: storageGet(HOST_CONV_KEY),
      visitorId: storageGet(HOST_VISITOR_KEY),
      visitorSecret: storageGet(HOST_SECRET_KEY),
      pageUrl: page.pageUrl,
      pageTitle: page.pageTitle,
      docked: useDock(),
      isMobile: sheetMode(),
      pinned: usePinned()
    });
  }

  function sendDockState() {
    tellChat({ type: 'chat-widget-docked', docked: useDock(), isMobile: sheetMode() });
  }

  btn.onclick = function() {
    if (isOpen) {
      closeChat();
    } else {
      openChat();
    }
  };

  window.addEventListener('message', function(e) {
    if (e.origin !== ${json(baseUrl)} || !iframeStarted) return;
    if (e.data && e.data.type === 'chat-widget-close') {
      if (!usePinned() && !useDock()) closeChat();
    }
    if (e.data && e.data.type === 'chat-widget-session') {
      storageSet(HOST_CONV_KEY, e.data.conversationId || '');
      storageSet(HOST_VISITOR_KEY, e.data.visitorId || '');
      storageSet(HOST_SECRET_KEY, e.data.visitorSecret || '');
      return;
    }
    if (e.data && e.data.type === 'chat-widget-expand') {
      if (isMobile() || useDock()) return;
      isExpanded = !isExpanded;
      updateIframeStyles();
      tellChat({ type: 'chat-widget-size-changed', expanded: isExpanded });
    }
  });

  function placeWidget() {
    if (usePinned()) {
      startIframe();
      if (iframe.parentElement !== helpMount) helpMount.appendChild(iframe);
      if (btn.parentElement) btn.parentElement.removeChild(btn);
      if (dockToggle.parentElement) dockToggle.parentElement.removeChild(dockToggle);
      isOpen = true;
      unlockBodyScroll();
    } else if (useDock()) {
      startIframe();
      updateIframeStyles();
      if (iframe.parentElement !== document.body) document.body.appendChild(iframe);
      if (btn.parentElement) btn.parentElement.removeChild(btn);
      if (!dockToggle.parentElement) document.body.appendChild(dockToggle);
      isOpen = !dockCollapsed;
      unlockBodyScroll();
    } else {
      if (iframeStarted && iframe.parentElement !== document.body) document.body.appendChild(iframe);
      if (!btn.parentElement) document.body.appendChild(btn);
      if (dockToggle.parentElement) dockToggle.parentElement.removeChild(dockToggle);
    }
    updateIframeStyles();
    updateButtonStyle();
    syncDockHost();
    tellChat({ type: 'chat-widget-pinned', pinned: usePinned(), docked: useDock(), isMobile: sheetMode() });
  }

  var lastPinned = usePinned();
  var lastDock = useDock();
  var lastSheet = sheetMode();
  window.addEventListener('resize', function() {
    var nowPinned = usePinned();
    var nowDock = useDock();
    var nowSheet = sheetMode();
    if (nowPinned !== lastPinned || nowDock !== lastDock || nowSheet !== lastSheet) {
      if (lastDock && !nowDock) isOpen = false;
      if (!lastDock && nowDock) isOpen = !dockCollapsed;
      lastPinned = nowPinned;
      lastDock = nowDock;
      lastSheet = nowSheet;
      if (nowSheet && isOpen && !nowDock) lockBodyScroll();
      if (!nowSheet || nowDock) unlockBodyScroll();
      placeWidget();
      sendDockState();
    } else if (nowSheet && isOpen) {
      setMobileStyles();
      tellChat({ type: 'chat-viewport-fit' });
    }
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function() {
      if (sheetMode() && isOpen) {
        setMobileStyles();
        tellChat({ type: 'chat-viewport-fit' });
      }
    });
    window.visualViewport.addEventListener('scroll', function() {
      if (sheetMode() && isOpen) setMobileStyles();
    });
  }

  iframe.addEventListener('load', function() {
    if (!iframeStarted) return;
    iframeLoaded = true;
    sendBoot();
    tellChat({ type: 'chat-widget-pinned', pinned: usePinned(), docked: useDock(), isMobile: sheetMode() });
    if (usePinned() || useDock() || isOpen) {
      tellChat({ type: 'chat-widget-opened', isMobile: sheetMode(), pinned: usePinned(), docked: useDock() });
    }
    sendPageContext();
    if (pendingSuggestion) {
      tellChat({ type: 'send-suggestion', message: pendingSuggestion });
      pendingSuggestion = '';
    }
    if (pendingAttachment) {
      tellChat({ type: 'help-attachment', dataUrl: pendingAttachment });
      pendingAttachment = '';
    }
  });

  if (dockMode) {
    window.addEventListener('popstate', sendPageContext);
    var originalPushState = history.pushState;
    var originalReplaceState = history.replaceState;
    history.pushState = function() {
      var result = originalPushState.apply(this, arguments);
      sendPageContext();
      return result;
    };
    history.replaceState = function() {
      var result = originalReplaceState.apply(this, arguments);
      sendPageContext();
      return result;
    };
  }

  placeWidget();

  var proactiveBubble = null;
  var articleSuggestion = articleSlug ? articleSuggestions[articleSlug] : null;

  if (articleSuggestion && !dockMode) {
    var dismissKey = ${json(proactiveDismissPrefix)} + articleSlug;
    var wasDismissed = localStorage.getItem(dismissKey);

    if (!wasDismissed) {
      proactiveBubble = document.createElement('div');
      proactiveBubble.id = 'chat-proactive-bubble';
      proactiveBubble.innerHTML = '<button class="proactive-close" title="${launcherCopy.proactiveCloseTitle}">&times;</button><div class="proactive-text">' + articleSuggestion.bubble + ' <span class="proactive-emoji">💬</span></div><button class="proactive-suggestion">' + articleSuggestion.prompt + '</button>';

      var proactiveStyle = document.createElement('style');
      proactiveStyle.textContent = '#chat-proactive-bubble{position:fixed;bottom:90px;right:20px;background:' + THEME.chatBg + ';border:1px solid ' + THEME.chatBorder + ';border-radius:' + THEME.radiusLg + ';box-shadow:0 4px 20px rgba(0,0,0,0.4);padding:12px 16px;max-width:220px;display:none;z-index:999998;font-family:' + THEME.fontBody + ';animation:proactiveFadeIn 0.3s ease;}@keyframes proactiveFadeIn{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}#chat-proactive-bubble .proactive-close{position:absolute;top:4px;right:8px;background:none;border:none;font-size:18px;color:' + THEME.muted + ';cursor:pointer;padding:0;line-height:1;}#chat-proactive-bubble .proactive-close:hover{color:' + THEME.htInk + ';}#chat-proactive-bubble .proactive-text{font-size:13px;color:' + THEME.htInk + ';margin-bottom:10px;padding-right:16px;line-height:1.4;}#chat-proactive-bubble .proactive-emoji{font-size:14px;}#chat-proactive-bubble .proactive-suggestion{display:block;width:100%;padding:10px 14px;background:' + THEME.btnBg + ';color:' + THEME.btnFg + ';border:none;border-radius:' + THEME.radiusBtn + ';font-size:13px;font-weight:500;cursor:pointer;transition:background 0.15s;text-align:left;}#chat-proactive-bubble .proactive-suggestion:hover{background:' + THEME.btnHover + ';}@media(max-width:768px){#chat-proactive-bubble{bottom:80px;right:12px;left:12px;max-width:none;}}';
      document.head.appendChild(proactiveStyle);

      document.body.appendChild(proactiveBubble);

      setTimeout(function() {
        if (proactiveBubble && !isOpen && !localStorage.getItem(dismissKey)) {
          proactiveBubble.style.display = 'block';
        }
      }, 3000);

      var closeBtn = proactiveBubble.querySelector('.proactive-close');
      closeBtn.onclick = function(e) {
        e.stopPropagation();
        localStorage.setItem(dismissKey, 'true');
        proactiveBubble.style.display = 'none';
      };

      var suggestionBtn = proactiveBubble.querySelector('.proactive-suggestion');
      suggestionBtn.onclick = function(e) {
        e.stopPropagation();
        proactiveBubble.style.display = 'none';
        localStorage.setItem(dismissKey, 'true');
        openChat();
        setTimeout(function() {
          if (iframeLoaded) tellChat({ type: 'send-suggestion', message: articleSuggestion.prompt });
          else pendingSuggestion = articleSuggestion.prompt;
        }, 300);
      };
    }
  }
})()`;
