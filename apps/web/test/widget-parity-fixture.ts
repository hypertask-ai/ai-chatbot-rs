export const widgetParityFixture = {
  copy: {
    headerSubtitle: "Answers in seconds",
    headerTitle: "Hyper AI",
    inputPlaceholder: "Ask a question…",
    privacyLong:
      "By chatting with us, you agree to the monitoring and recording of this chat to deliver our services and processing of your personal data in accordance with our Privacy Policy. ",
    privacyShort: "By chatting with us, you agree to our ",
    takeoverNote: "A person takes over when the bot can't help",
    welcomeBody:
      "Ask anything about Hypertask. Answers come from our help articles.",
    welcomeHeading: "Hi, how can we help?",
  },
  historyMerge: [
    {
      expected: {
        keptLocal: 0,
        messages: [],
      },
      onScreen: [],
      server: [],
    },
    {
      expected: {
        keptLocal: 1,
        messages: [
          {
            content: "a",
            role: "user",
          },
        ],
      },
      onScreen: [
        {
          content: "a",
          role: "user",
        },
      ],
      server: [],
    },
    {
      expected: {
        keptLocal: 2,
        messages: [
          {
            content: "a",
            role: "user",
          },
          {
            content: "b",
            role: "bot",
          },
        ],
      },
      onScreen: [
        {
          content: "a",
          role: "user",
        },
        {
          content: "b",
          role: "bot",
        },
      ],
      server: [],
    },
    {
      expected: {
        keptLocal: 3,
        messages: [
          {
            content: "a",
            role: "user",
          },
          {
            content: "b",
            role: "bot",
          },
          {
            content: "c",
            role: "user",
          },
        ],
      },
      onScreen: [
        {
          content: "a",
          role: "user",
        },
        {
          content: "b",
          role: "bot",
        },
        {
          content: "c",
          role: "user",
        },
      ],
      server: [],
    },
    {
      expected: {
        keptLocal: 0,
        messages: [
          {
            content: "a",
            role: "user",
          },
        ],
      },
      onScreen: [],
      server: [
        {
          content: "a",
          role: "user",
        },
      ],
    },
    {
      expected: {
        keptLocal: 0,
        messages: [
          {
            content: "a",
            role: "user",
          },
        ],
      },
      onScreen: [
        {
          content: "a",
          role: "user",
        },
      ],
      server: [
        {
          content: "a",
          role: "user",
        },
      ],
    },
    {
      expected: {
        keptLocal: 1,
        messages: [
          {
            content: "a",
            role: "user",
          },
          {
            content: "b",
            role: "bot",
          },
        ],
      },
      onScreen: [
        {
          content: "a",
          role: "user",
        },
        {
          content: "b",
          role: "bot",
        },
      ],
      server: [
        {
          content: "a",
          role: "user",
        },
      ],
    },
    {
      expected: {
        keptLocal: 2,
        messages: [
          {
            content: "a",
            role: "user",
          },
          {
            content: "b",
            role: "bot",
          },
          {
            content: "c",
            role: "user",
          },
        ],
      },
      onScreen: [
        {
          content: "a",
          role: "user",
        },
        {
          content: "b",
          role: "bot",
        },
        {
          content: "c",
          role: "user",
        },
      ],
      server: [
        {
          content: "a",
          role: "user",
        },
      ],
    },
    {
      expected: {
        keptLocal: 0,
        messages: [
          {
            content: "a",
            role: "user",
          },
          {
            content: "b",
            role: "bot",
          },
        ],
      },
      onScreen: [],
      server: [
        {
          content: "a",
          role: "user",
        },
        {
          content: "b",
          role: "bot",
        },
      ],
    },
    {
      expected: {
        keptLocal: 1,
        messages: [
          {
            content: "a",
            role: "user",
          },
          {
            content: "b",
            role: "bot",
          },
          {
            content: "a",
            role: "user",
          },
        ],
      },
      onScreen: [
        {
          content: "a",
          role: "user",
        },
      ],
      server: [
        {
          content: "a",
          role: "user",
        },
        {
          content: "b",
          role: "bot",
        },
      ],
    },
    {
      expected: {
        keptLocal: 0,
        messages: [
          {
            content: "a",
            role: "user",
          },
          {
            content: "b",
            role: "bot",
          },
        ],
      },
      onScreen: [
        {
          content: "a",
          role: "user",
        },
        {
          content: "b",
          role: "bot",
        },
      ],
      server: [
        {
          content: "a",
          role: "user",
        },
        {
          content: "b",
          role: "bot",
        },
      ],
    },
    {
      expected: {
        keptLocal: 1,
        messages: [
          {
            content: "a",
            role: "user",
          },
          {
            content: "b",
            role: "bot",
          },
          {
            content: "c",
            role: "user",
          },
        ],
      },
      onScreen: [
        {
          content: "a",
          role: "user",
        },
        {
          content: "b",
          role: "bot",
        },
        {
          content: "c",
          role: "user",
        },
      ],
      server: [
        {
          content: "a",
          role: "user",
        },
        {
          content: "b",
          role: "bot",
        },
      ],
    },
    {
      expected: {
        keptLocal: 0,
        messages: [
          {
            content: "a",
            role: "user",
          },
          {
            content: "b",
            role: "bot",
          },
          {
            content: "c",
            role: "user",
          },
        ],
      },
      onScreen: [],
      server: [
        {
          content: "a",
          role: "user",
        },
        {
          content: "b",
          role: "bot",
        },
        {
          content: "c",
          role: "user",
        },
      ],
    },
    {
      expected: {
        keptLocal: 1,
        messages: [
          {
            content: "a",
            role: "user",
          },
          {
            content: "b",
            role: "bot",
          },
          {
            content: "c",
            role: "user",
          },
          {
            content: "a",
            role: "user",
          },
        ],
      },
      onScreen: [
        {
          content: "a",
          role: "user",
        },
      ],
      server: [
        {
          content: "a",
          role: "user",
        },
        {
          content: "b",
          role: "bot",
        },
        {
          content: "c",
          role: "user",
        },
      ],
    },
    {
      expected: {
        keptLocal: 2,
        messages: [
          {
            content: "a",
            role: "user",
          },
          {
            content: "b",
            role: "bot",
          },
          {
            content: "c",
            role: "user",
          },
          {
            content: "a",
            role: "user",
          },
          {
            content: "b",
            role: "bot",
          },
        ],
      },
      onScreen: [
        {
          content: "a",
          role: "user",
        },
        {
          content: "b",
          role: "bot",
        },
      ],
      server: [
        {
          content: "a",
          role: "user",
        },
        {
          content: "b",
          role: "bot",
        },
        {
          content: "c",
          role: "user",
        },
      ],
    },
    {
      expected: {
        keptLocal: 0,
        messages: [
          {
            content: "a",
            role: "user",
          },
          {
            content: "b",
            role: "bot",
          },
          {
            content: "c",
            role: "user",
          },
        ],
      },
      onScreen: [
        {
          content: "a",
          role: "user",
        },
        {
          content: "b",
          role: "bot",
        },
        {
          content: "c",
          role: "user",
        },
      ],
      server: [
        {
          content: "a",
          role: "user",
        },
        {
          content: "b",
          role: "bot",
        },
        {
          content: "c",
          role: "user",
        },
      ],
    },
    {
      expected: {
        keptLocal: 0,
        messages: [
          {
            content: "a",
            role: "user",
          },
        ],
      },
      onScreen: [
        {
          content: "a",
          node: "n1",
          role: "user",
        },
      ],
      server: [
        {
          content: "a",
          role: "user",
        },
      ],
    },
    {
      expected: {
        keptLocal: 1,
        messages: [
          {
            content: "x",
            role: "user",
          },
        ],
      },
      onScreen: [
        {
          content: "x",
          node: "n1",
          role: "user",
        },
      ],
      server: [],
    },
    {
      expected: {
        keptLocal: 2,
        messages: [
          {
            content: "b",
            role: "bot",
          },
          {
            content: "x",
            role: "user",
          },
          {
            content: "b",
            role: "bot",
          },
        ],
      },
      onScreen: [
        {
          content: "x",
          node: "n1",
          role: "user",
        },
        {
          content: "b",
          node: "n2",
          role: "bot",
        },
      ],
      server: [
        {
          content: "b",
          role: "bot",
        },
      ],
    },
  ],
  markdown: [
    {
      html: "<p>Hello <strong>bold</strong> and <code>code</code></p>",
      input: "Hello **bold** and `code`",
    },
    {
      html: "<p>Plain answer with no markup.</p>",
      input: "Plain answer with no markup.",
    },
    {
      html: "<p>First line<br>Second line</p><p>New paragraph</p>",
      input: "First line\nSecond line\n\nNew paragraph",
    },
    {
      html: "<ul><li>one</li><li>two</li><li>three</li></ul>",
      input: "- one\n- two\n- three",
    },
    {
      html: "<ol><li>first</li><li>second</li></ol>",
      input: "1. first\n2. second",
    },
    {
      html: '<p>See <a href="https://help.hypertask.ai/help/boards-sections" data-help-slug="boards-sections">the docs</a>.</p>',
      input: "See [the docs](https://help.hypertask.ai/help/boards-sections).",
    },
    {
      html: "<p>Read /help/install-the-cli for more.</p>",
      input: "Read /help/install-the-cli for more.",
    },
    {
      html: '<p>Visit <a href="https://hypertask.ai/pricing/" target="_blank" rel="noopener noreferrer">https://hypertask.ai/pricing/</a> to see plans.</p>',
      input: "Visit https://hypertask.ai/pricing/ to see plans.",
    },
    {
      html: "<p>Unsafe &lt;script&gt;alert(1)&lt;/script&gt; and &amp; ampersand</p>",
      input: "Unsafe <script>alert(1)</script> and & ampersand",
    },
    {
      html: "<p>[bad](javascript:alert(1))</p>",
      input: "[bad](javascript:alert(1))",
    },
    {
      html: "<p>Text with email support@hypertask.ai</p>",
      input: "Text with email support@hypertask.ai",
    },
    {
      html: '<pre><code class="language-js">const a = 1 &lt; 2;</code></pre>',
      input: "```js\nconst a = 1 < 2;\n```",
    },
    {
      html: "<p>Intro</p><pre><code>plain fence</code></pre><p>Outro</p>",
      input: "Intro\n```\nplain fence\n```\nOutro",
    },
    {
      html: "<p><strong>Bold</strong> then - item</p><ul><li>item two</li></ul>",
      input: "**Bold** then - item\n- item two",
    },
    {
      html: "<p>A sentence with quoted &quot;quotes&quot; and it`s apostrophe</p>",
      input: 'A sentence with quoted "quotes" and it`s apostrophe',
    },
    {
      html: "<p>Line one</p><ul><li><strong>Bold bullet</strong> breaks inline</li></ul>",
      input: "Line one  - **Bold bullet** breaks inline",
    },
    {
      html: '<p><a href="https://example.com/a_(b" target="_blank" rel="noopener noreferrer">link with parens</a>)</p>',
      input: "[link with parens](https://example.com/a_(b))",
    },
    {
      html: '<p><a href="https://example.com/path).trailing" target="_blank" rel="noopener noreferrer">https://example.com/path).trailing</a></p>',
      input: "https://example.com/path).trailing",
    },
    {
      html: "<p>http://localhost:8787/help/test</p>",
      input: "http://localhost:8787/help/test",
    },
    {
      html: "<p>mailto:me@example.com link</p>",
      input: "mailto:me@example.com link",
    },
    {
      html: '<p><strong>Pricing</strong>: <a href="https://hypertask.ai/pricing/" target="_blank" rel="noopener noreferrer">https://hypertask.ai/pricing/</a></p>',
      input: "**Pricing**: https://hypertask.ai/pricing/",
    },
  ],
  storage: {
    dockCollapsed: "hypertask-chat-dock-collapsed",
    frame: {
      conversation: "chat_conversation_id",
      visitor: "chat_visitor_id",
      visitorSecret: "chat_visitor_secret",
    },
    host: {
      conversation: "hypertask_chat_conversation_id",
      visitor: "hypertask_chat_visitor_id",
      visitorSecret: "hypertask_chat_visitor_secret",
    },
    proactiveDismissPrefix: "chat-bubble-dismissed-",
  },
  suggestions: {
    article: {
      "troubleshooting-email-login-magic-link": {
        bubble: "Still having trouble logging in?",
        prompt: "I can't log in",
      },
      "troubleshooting-google-workspace-login": {
        bubble: "Google login not working?",
        prompt: "Google sign-in isn't working",
      },
    },
    starter: ["Connect Claude to my board", "Invite my team", "Change my plan"],
  },
} as const;
