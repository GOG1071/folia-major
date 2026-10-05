import { type Page } from '@playwright/test';
import { APP_VERSION, GUIDE_VERSION_STORAGE_KEY, waitForAppMounted } from '../../helpers/appState';
import { MOTION_SURFACE_IDS } from '../../../src/stores/useMotionSettingsStore';

// test/ui/helpers/appFixtures.ts
// The mocked QQ Music / Navidrome / local-library world the UI specs boot the app into.
//
// This used to live inside app.screenshot.spec.ts, which is where it was written and where it was
// stuck: any other spec that needed a real, populated home surface had to either re-mock all of it
// or give up and test something narrower. The screenshots still use exactly what they always did.


export type MockQqMode = 'logged-in' | 'guest';

// 与 playwright.config.ts 里 webServer 注入的 VITE_QQ_API_BASE 同一个路径段，改一处必须改另一处。
export const QQ_MOCK_ROUTE = '**/__mock_qq__/**';
export const QQ_SESSION_STORAGE_KEY = 'online_provider:qq:cookie';
export const QQ_SESSION_COOKIE = 'qqmusic_session=fixture-session-token';

export const NAVIDROME_SERVER = 'http://navidrome.test';

export const svgDataUrl = (label: string, background: string, foreground = '#ffffff') =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
      <rect width="600" height="600" fill="${background}" rx="48"/>
      <text x="50%" y="50%" fill="${foreground}" font-size="56" font-family="Arial, sans-serif" text-anchor="middle" dominant-baseline="middle">${label}</text>
    </svg>`
  )}`;

export const createNavidromeCoverSvg = (label: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1f2937" />
        <stop offset="100%" stop-color="#0f766e" />
      </linearGradient>
    </defs>
    <rect width="600" height="600" fill="url(#bg)" rx="48"/>
    <circle cx="300" cy="300" r="160" fill="rgba(255,255,255,0.14)" />
    <text x="50%" y="50%" fill="#f8fafc" font-size="56" font-family="Arial, sans-serif" text-anchor="middle" dominant-baseline="middle">${label}</text>
  </svg>`;

// 形状取自 qqNormalize.ts 读的上游原始条目：`/login/status` 的 profile、`/user/playlist` 的
// GetPlaylistByUin 条目（自建歌单带 dirName / songNum / bigpicUrl）。
export const qqFixtures = {
  profile: {
    str_musicid: '1001',
    nickname: 'Fixture Listener',
    avatarUrl: svgDataUrl('User', '#2563eb'),
  },
  playlists: [
    {
      tid: 9001,
      dirId: 101,
      dirName: 'Daily Mix',
      dirShow: 1,
      songNum: 18,
      bigpicUrl: svgDataUrl('Mix', '#ef4444'),
    },
    {
      tid: 9002,
      dirId: 102,
      dirName: 'Late Night Drive',
      dirShow: 1,
      songNum: 32,
      bigpicUrl: svgDataUrl('Drive', '#7c3aed'),
    },
  ],
};

export const navidromeFixtures = {
  config: {
    serverUrl: NAVIDROME_SERVER,
    username: 'fixture',
    passwordHash: 'fixture-password',
  },
  albums: [
    {
      id: 'album-aurora',
      name: 'Aurora Echoes',
      artist: 'Test Ensemble',
      artistId: 'artist-1',
      coverArt: 'cover-aurora',
      songCount: 8,
      duration: 1620,
      year: 2024,
    },
    {
      id: 'album-sunrise',
      name: 'Sunrise Circuit',
      artist: 'Signal Bloom',
      artistId: 'artist-2',
      coverArt: 'cover-sunrise',
      songCount: 11,
      duration: 1980,
      year: 2023,
    },
  ],
  playlists: [
    {
      id: 'playlist-main',
      name: 'Workspace Rotation',
      owner: 'fixture',
      coverArt: 'cover-playlist-main',
      songCount: 12,
    },
  ],
  artists: [
    {
      id: 'artist-1',
      name: 'Test Ensemble',
      albumCount: 1,
    },
    {
      id: 'artist-2',
      name: 'Signal Bloom',
      albumCount: 1,
    },
  ],
  randomSongs: [
    {
      id: 'song-random-1',
      title: 'Random Access Heart',
      album: 'Aurora Echoes',
      albumId: 'album-aurora',
      artist: 'Test Ensemble',
      artistId: 'artist-1',
      coverArt: 'cover-aurora',
      duration: 210,
      track: 1,
    },
  ],
  favoriteSongs: [
    {
      id: 'song-favorite-1',
      title: 'Starboard Lights',
      album: 'Sunrise Circuit',
      albumId: 'album-sunrise',
      artist: 'Signal Bloom',
      artistId: 'artist-2',
      coverArt: 'cover-sunrise',
      duration: 225,
      track: 2,
    },
  ],
};

export const localImportFixture = {
  rootName: 'Fixture Library',
  entries: [
    {
      kind: 'file',
      name: 'Test Artist - Midnight Train.mp3',
      type: 'audio/mpeg',
      content: 'fake-audio-data',
      lastModified: 1710000000000,
    },
    {
      kind: 'file',
      name: 'Test Artist - Midnight Train.lrc',
      type: 'text/plain',
      content: '[00:00.00]Midnight Train\n[00:12.00]Leaves the station',
      lastModified: 1710000000000,
    },
    {
      kind: 'file',
      name: 'cover.jpg',
      type: 'image/jpeg',
      content: 'fixture-cover',
      lastModified: 1710000000000,
    },
  ],
};

export async function installBaseState(
  page: Page,
  options: {
    qqMode?: MockQqMode;
    navidromeEnabled?: boolean;
    localImportFixture?: typeof localImportFixture;
    preserveNativeMediaQueries?: boolean;
  } = {},
) {
  await page.addInitScript((payload: {
    navidromeServer: string;
    qqMode: MockQqMode;
    navidromeEnabled: boolean;
    qqSessionStorageKey: string;
    qqSessionCookie: string;
    navidromeConfig: typeof navidromeFixtures.config;
    localImportFixture?: typeof localImportFixture;
    appVersion: string;
    guideVersionStorageKey: string;
    motionSurfaces: string[];
    preserveNativeMediaQueries: boolean;
  }) => {
    const createMatchMediaResult = (query: string) => ({
      matches: query.includes('light'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });

    if (!payload.preserveNativeMediaQueries) {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: (query: string) => createMatchMediaResult(query),
      });
    }

    Object.defineProperty(navigator, 'language', {
      configurable: true,
      value: 'en-US',
    });
    Object.defineProperty(navigator, 'languages', {
      configurable: true,
      value: ['en-US', 'en'],
    });

    localStorage.clear();
    localStorage.setItem('i18nextLng', 'en');
    localStorage.setItem('default_theme_daylight', 'true');
    localStorage.setItem('static_mode', 'true');
    // 动效不再跟随系统偏好（issue #370），所以 emulateMedia({ reducedMotion: 'reduce' }) 自己
    // 已经冻结不了任何东西了。截图基线要的是静止画面，得把每个动效面显式降级 —— 清单直接取自
    // MOTION_SURFACE_IDS，新增一面（例如歌单展开转场）不必再回来改这里。
    for (const surface of payload.motionSurfaces) {
      localStorage.setItem(`reduce_motion_${surface}`, 'true');
    }
    localStorage.setItem('last_app_view', 'home');
    localStorage.setItem('last_home_view_tab', 'playlist');
    // 必须写当前版本：写死旧版本会让用户指引弹窗自动弹出并盖住整页，后续点击全部被拦截
    localStorage.setItem(payload.guideVersionStorageKey, payload.appVersion);

    if (payload.navidromeEnabled) {
      localStorage.setItem('navidrome_enabled', 'true');
      localStorage.setItem('navidrome_config', JSON.stringify(payload.navidromeConfig));
    }

    if (payload.qqMode === 'logged-in') {
      localStorage.setItem(payload.qqSessionStorageKey, payload.qqSessionCookie);
    }

    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: {
        getAudioCacheUsage: async () => 0,
        clearAudioCache: async () => {},
        getAudioCacheStats: async () => ({ size: 0, count: 0 }),
        isWindowMaximized: async () => false,
        // WindowControls 挂载时就会订阅/查询全屏状态；缺了它整棵树会被卸掉，应用永远不脱离 splash。
        isWindowFullscreen: async () => false,
        onWindowFullscreenChanged: () => () => {},
      },
    });

    window.alert = () => {};

    if (!payload.localImportFixture) {
      return;
    }

    // 这段函数由 Playwright 的 Babel 编译后原样送进浏览器。`#private` 字段会被改写成调用
    // `_classPrivateFieldInitSpec` 等辅助函数，而浏览器里没有它们，构造时直接 ReferenceError。
    // 所以这里只能用 TS 的 `private`（编译期擦除）。
    class MockAudio extends EventTarget {
      duration = 126;
      private srcValue = '';

      set src(value: string) {
        this.srcValue = value;
        void this.srcValue;
        setTimeout(() => {
          this.dispatchEvent(new Event('loadedmetadata'));
        }, 0);
      }

      get src() {
        return this.srcValue;
      }
    }

    const OriginalWorker = window.Worker;
    class MockWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      private readonly url: string;

      constructor(url: string | URL) {
        this.url = String(url);

        if (!this.url.includes('metadataParser.worker')) {
          return new OriginalWorker(url as string, { type: 'module' }) as unknown as MockWorker;
        }
      }

      postMessage(message: { type: string; requestId: string; file?: File; cover?: Blob; }) {
        if (!this.url.includes('metadataParser.worker')) {
          return;
        }

        if (message.type === 'hash-cover' && message.cover) {
          setTimeout(() => {
            this.onmessage?.({
              data: {
                type: 'result',
                requestId: message.requestId,
                data: {
                  cover: message.cover,
                  coverAssetId: `sha256:${'f'.repeat(64)}`,
                },
              },
            } as MessageEvent);
          }, 0);
          return;
        }

        if (message.type !== 'parse-metadata' || !message.file) {
          return;
        }

        const baseName = message.file.name.replace(/\.[^.]+$/, '');
        const [artist = 'Fixture Artist', title = baseName] = baseName.split(' - ');
        const response = {
          type: 'result',
          requestId: message.requestId,
          data: {
            title,
            artist,
            album: 'Fixture Album',
            duration: 126000,
          },
        };

        setTimeout(() => {
          this.onmessage?.({ data: response } as MessageEvent);
        }, 0);
      }

      terminate() {}

      addEventListener() {}

      removeEventListener() {}
    }

    Object.defineProperty(window, 'Worker', {
      configurable: true,
      value: MockWorker,
    });
    Object.defineProperty(window, 'Audio', {
      configurable: true,
      value: MockAudio,
    });

    const createFileHandle = (entry: typeof localImportFixture.entries[number]) => ({
      kind: 'file' as const,
      name: entry.name,
      async getFile() {
        return new File([entry.content], entry.name, {
          type: entry.type,
          lastModified: entry.lastModified,
        });
      },
    });

    const createDirectoryHandle = (fixture: typeof localImportFixture) => {
      const fileHandles = fixture.entries.map(createFileHandle);

      return {
        kind: 'directory' as const,
        name: fixture.rootName,
        async *values() {
          for (const handle of fileHandles) {
            yield handle;
          }
        },
        async getFileHandle(name: string) {
          const handle = fileHandles.find(item => item.name === name);
          if (!handle) {
            throw new DOMException(`Missing file: ${name}`, 'NotFoundError');
          }
          return handle;
        },
        async getDirectoryHandle() {
          throw new DOMException('Nested directories are not defined in this fixture', 'NotFoundError');
        },
        async queryPermission() {
          return 'granted';
        },
        async requestPermission() {
          return 'granted';
        },
      };
    };

    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => createDirectoryHandle(payload.localImportFixture!),
    });
  }, {
    navidromeServer: NAVIDROME_SERVER,
    qqMode: options.qqMode ?? 'guest',
    qqSessionStorageKey: QQ_SESSION_STORAGE_KEY,
    qqSessionCookie: QQ_SESSION_COOKIE,
    navidromeEnabled: options.navidromeEnabled ?? false,
    navidromeConfig: navidromeFixtures.config,
    localImportFixture: options.localImportFixture,
    appVersion: APP_VERSION,
    guideVersionStorageKey: GUIDE_VERSION_STORAGE_KEY,
    motionSurfaces: [...MOTION_SURFACE_IDS],
    preserveNativeMediaQueries: options.preserveNativeMediaQueries ?? false,
  });
}

// 只覆盖渲染进程真正会打到 qqTransport 的路由（路径见 qqTransport.ts 的 ENDPOINTS）。
// 未登记的路由回 `{}`：对应 provider 方法要么按「没有数据」处理，要么落到各自的回退分支。
export async function mockQqApi(page: Page, mode: MockQqMode) {
  let qrConfirmed = false;
  await page.route(QQ_MOCK_ROUTE, async route => {
    const url = new URL(route.request().url());
    const endpoint = url.pathname.replace('/__mock_qq__', '');
    const json = (body: unknown) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

    // 只声明一个通道：provider 会跳过通道选择器直接进单步扫码流程，登录用例不必多点一次。
    if (endpoint === '/login/channels') {
      await json({ data: { channels: ['wechat'] } });
      return;
    }
    if (mode === 'guest' && endpoint === '/login/qr/key') {
      await json({ data: { unikey: 'fixture-qr-key' } });
      return;
    }
    if (mode === 'guest' && endpoint === '/login/qr/create') {
      await json({ data: { qrimg: svgDataUrl('QR', '#ffffff', '#111827') } });
      return;
    }
    if (mode === 'guest' && endpoint === '/login/qr/check') {
      qrConfirmed = true;
      await json({ code: 803, cookie: QQ_SESSION_COOKIE });
      return;
    }

    const isSignedIn = mode === 'logged-in' || qrConfirmed;
    if (endpoint === '/login/status') {
      await json(isSignedIn ? { data: { profile: qqFixtures.profile } } : { data: {} });
      return;
    }
    if (endpoint === '/user/playlist') {
      await json(isSignedIn ? { playlist: qqFixtures.playlists, total: qqFixtures.playlists.length } : { playlist: [] });
      return;
    }
    if (endpoint === '/user/albums') {
      await json({ albums: [], total: 0, more: false });
      return;
    }
    if (endpoint === '/user/liked-songs') {
      await json({ songs: [], total: 0, more: false });
      return;
    }

    await json({});
  });
}

export async function mockNavidromeApi(page: Page) {
  await page.route(`${NAVIDROME_SERVER}/**`, async route => {
    const url = new URL(route.request().url());
    const endpoint = url.pathname.replace('/rest/', '');

    if (endpoint === 'getCoverArt') {
      const id = url.searchParams.get('id') || 'cover';
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: createNavidromeCoverSvg(id.replace(/^cover-/, '').toUpperCase()),
      });
      return;
    }

    const responses: Record<string, unknown> = {
      getAlbumList2: {
        'subsonic-response': {
          status: 'ok',
          albumList2: {
            album: navidromeFixtures.albums,
          },
        },
      },
      getPlaylists: {
        'subsonic-response': {
          status: 'ok',
          playlists: {
            playlist: navidromeFixtures.playlists,
          },
        },
      },
      getArtists: {
        'subsonic-response': {
          status: 'ok',
          artists: {
            index: [
              {
                name: 'F',
                artist: navidromeFixtures.artists,
              },
            ],
          },
        },
      },
      getStarred2: {
        'subsonic-response': {
          status: 'ok',
          starred2: {
            song: navidromeFixtures.favoriteSongs,
          },
        },
      },
      getRandomSongs: {
        'subsonic-response': {
          status: 'ok',
          randomSongs: {
            song: navidromeFixtures.randomSongs,
          },
        },
      },
      getOpenSubsonicExtensions: {
        'subsonic-response': {
          status: 'ok',
          openSubsonic: true,
          openSubsonicExtensions: [
            { name: 'songLyrics', versions: [1] },
            { name: 'formPost', versions: [1] },
          ],
        },
      },
      getUser: {
        'subsonic-response': {
          status: 'ok',
          user: {
            username: navidromeFixtures.config.username,
            scrobblingEnabled: true,
          },
        },
      },
      getMusicFolders: {
        'subsonic-response': {
          status: 'ok',
          musicFolders: {
            musicFolder: [
              { id: 'music', name: 'Music' },
            ],
          },
        },
      },
      getLicense: {
        'subsonic-response': {
          status: 'ok',
          license: {
            valid: true,
          },
        },
      },
      scrobble: {
        'subsonic-response': {
          status: 'ok',
        },
      },
    };

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(responses[endpoint] ?? {
        'subsonic-response': {
          status: 'ok',
        },
      }),
    });
  });
}

export async function openApp(page: Page) {
  await page.goto('/');
  await waitForAppMounted(page);
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        caret-color: transparent !important;
      }
      /* 隐藏所有 canvas：shell 背景是 Paper shader（latent 模式），每次加载的相位不同，
         即使 static_mode 冻结了动画，跨加载依然渲染出不同纹理 —— 实测三次加载得到三个哈希。
         不中和它就录不出稳定基线。用 visibility 而非 display，保持布局不变。 */
      canvas {
        visibility: hidden !important;
      }
    `,
  });
}
