import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import './App.css'

const API_BASE = '/youtube/api'

const siteLinks = [
  { label: 'Home', href: '/home' },
  { label: 'Games', href: '/games' },
  { label: 'Proxies', href: '/browsing' },
  { label: 'WuTube', href: '/youtube' },
]

const quickLinks = [
  { label: 'Trending', query: 'trending videos today', icon: 'fa-fire' },
  { label: 'Music', query: 'official music video', icon: 'fa-music' },
  { label: 'Gaming', query: 'gaming highlights', icon: 'fa-gamepad' },
  { label: 'Coding', query: 'coding tutorial', icon: 'fa-code' },
]

const libraryLinks = [
  { label: 'History', path: '/library/history' },
  { label: 'Watch Later', path: '/library/watch-later' },
  { label: 'Liked', path: '/library/liked' },
]

function usePersistentState(key, initialValue) {
  const [value, setValue] = useState(() => {
    const saved = window.localStorage.getItem(key)
    return saved ? JSON.parse(saved) : initialValue
  })

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(value))
  }, [key, value])

  return [value, setValue]
}

async function fetchJson(url) {
  const response = await fetch(url)
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.error || `Request failed: ${response.status}`)
  }
  return data
}

function formatNumber(value) {
  if (!value) return 'No views yet'
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function upsertVideo(list, video) {
  const next = [video, ...list.filter((item) => item.videoId !== video.videoId)]
  return next.slice(0, 48)
}

function embedUrlFor(videoId) {
  if (typeof window === 'undefined' || !window.location?.origin) {
    return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`
  }

  const origin = encodeURIComponent(window.location.origin)
  return [
    `https://www.youtube.com/embed/${videoId}`,
    '?autoplay=1',
    '&rel=0',
    '&modestbranding=1',
    '&playsinline=1',
    '&enablejsapi=1',
    `&origin=${origin}`,
    `&widget_referrer=${origin}`,
  ].join('')
}

function App() {
  const location = useLocation()
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'light'
    return window.localStorage.getItem('wubu-theme') === 'dark' ? 'dark' : 'light'
  })
  const [history, setHistory] = usePersistentState('wutube-history', [])
  const [watchLater, setWatchLater] = usePersistentState('wutube-watch-later', [])
  const [liked, setLiked] = usePersistentState('wutube-liked', [])

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
    window.localStorage.setItem('wubu-theme', theme)
  }, [theme])

  const saveHistory = useCallback(
    (video) => {
      setHistory((current) => upsertVideo(current, video))
    },
    [setHistory],
  )

  const toggleWatchLater = useCallback(
    (video) => {
      setWatchLater((current) =>
        current.some((item) => item.videoId === video.videoId)
          ? current.filter((item) => item.videoId !== video.videoId)
          : upsertVideo(current, video),
      )
    },
    [setWatchLater],
  )

  const toggleLiked = useCallback(
    (video) => {
      setLiked((current) =>
        current.some((item) => item.videoId === video.videoId)
          ? current.filter((item) => item.videoId !== video.videoId)
          : upsertVideo(current, video),
      )
    },
    [setLiked],
  )

  const library = useMemo(
    () => ({
      history,
      watchLater,
      liked,
      saveHistory,
      toggleWatchLater,
      toggleLiked,
      isSaved(list, videoId) {
        return list.some((item) => item.videoId === videoId)
      },
    }),
    [history, liked, saveHistory, toggleLiked, toggleWatchLater, watchLater],
  )

  const headerKey = location.pathname === '/results' ? location.search : location.pathname

  return (
    <div className="app-shell wutube-shell">
      <Header
        key={headerKey}
        theme={theme}
        onToggleTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
      />
      <main className="wutube-main">
        <div className="container wutube-container">
          <Routes>
            <Route path="/" element={<HomePage library={library} />} />
            <Route path="/results" element={<SearchPage />} />
            <Route path="/watch/:videoId" element={<WatchPage library={library} />} />
            <Route path="/library/:collection" element={<LibraryPage library={library} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
      <div className="footer">Wubu &copy; 2026</div>
    </div>
  )
}

function Header({ theme, onToggleTheme }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [query, setQuery] = useState(params.get('search_query') ?? '')

  function submitSearch(event) {
    event.preventDefault()
    if (!query.trim()) return
    navigate(`/results?search_query=${encodeURIComponent(query.trim())}`)
  }

  return (
    <nav className="nav wutube-nav">
      <a className="nav-brand" href="/home">
        <span className="nav-brand-mark">
          <img alt="" className="nav-brand-logo nav-brand-logo-light" src="/assets/img/logo-light.webp" />
          <img alt="" className="nav-brand-logo nav-brand-logo-dark" src="/assets/img/logo.webp" />
        </span>
        <span>Wubu</span>
      </a>

      <div className="nav-links">
        {siteLinks.map((item) => (
          <a className={item.href === '/youtube' ? 'active' : ''} href={item.href} key={item.href}>
            {item.label}
          </a>
        ))}
      </div>

      <form className="wutube-nav-search" onSubmit={submitSearch}>
        <input
          aria-label="Search YouTube videos"
          placeholder="Search YouTube"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button className="btn btn-primary" type="submit">
          Search
        </button>
      </form>

      <div className="nav-actions wutube-actions">
        <Link className="wutube-mini-link" to="/library/watch-later">
          Later
        </Link>
        <Link className="wutube-mini-link" to="/library/liked">
          Liked
        </Link>
        <button className="nav-icon" onClick={onToggleTheme} title="Toggle theme" type="button">
          <i className={`fas ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`}></i>
        </button>
      </div>
    </nav>
  )
}

function HomePage({ library }) {
  const [state, setState] = useState({
    sections: [],
    loading: true,
    error: '',
    degraded: false,
  })

  useEffect(() => {
    let cancelled = false

    async function load() {
      setState((current) => ({ ...current, loading: true, error: '' }))
      try {
        const data = await fetchJson(`${API_BASE}/home`)
        if (!cancelled) {
          setState({
            sections: data.sections ?? [],
            loading: false,
            error: '',
            degraded: Boolean(data.degraded),
          })
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            sections: [],
            loading: false,
            error: error.message || 'WuTube could not load the home feed.',
            degraded: false,
          })
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="page wutube-page">
      <section className="wutube-hero">
        <div className="wutube-hero-copy">
          <p className="wutube-kicker">WuTube</p>
          <h1>Watch YouTube inside the actual Wubu shell.</h1>
          <p className="wutube-subtitle">
            Search, watch, and reopen videos from a real Wubu page instead of a separate clone UI.
          </p>
        </div>
        <div className="wutube-quick-strip">
          {quickLinks.map((item) => (
            <Link
              className="wutube-quick-link"
              key={item.label}
              to={`/results?search_query=${encodeURIComponent(item.query)}`}
            >
              <i className={`fas ${item.icon}`}></i>
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="wutube-rail">
        <div>
          <p className="wutube-rail-label">Library</p>
          <div className="wutube-rail-links">
            {libraryLinks.map((item) => (
              <Link key={item.path} to={item.path}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="wutube-rail-stats">
          <span>{library.history.length} viewed</span>
          <span>{library.watchLater.length} saved</span>
          <span>{library.liked.length} liked</span>
        </div>
      </section>

      {state.degraded ? (
        <div className="status-banner">WuTube is serving a reduced feed right now.</div>
      ) : null}
      {state.loading ? <LoadingState message="Loading the WuTube home feed..." /> : null}
      {state.error ? <ErrorState message={state.error} /> : null}

      {!state.loading && !state.error
        ? state.sections.map((section) => (
            <section className="feed-section" key={section.title}>
              <div className="wutube-section-head">
                <div>
                  <p className="wutube-kicker">Feed</p>
                  <h2>{section.title}</h2>
                </div>
                <Link to={`/results?search_query=${encodeURIComponent(section.query)}`}>Open search</Link>
              </div>
              <VideoGrid videos={section.videos} />
            </section>
          ))
        : null}
    </div>
  )
}

function SearchPage() {
  const [params] = useSearchParams()
  const query = params.get('search_query')?.trim() ?? ''
  const [state, setState] = useState({
    videos: [],
    loading: Boolean(query),
    error: '',
    degraded: false,
  })

  useEffect(() => {
    if (!query) return undefined

    let cancelled = false

    async function load() {
      setState((current) => ({ ...current, loading: true, error: '' }))
      try {
        const data = await fetchJson(`${API_BASE}/search?q=${encodeURIComponent(query)}`)
        if (!cancelled) {
          setState({
            videos: data.videos ?? [],
            loading: false,
            error: '',
            degraded: Boolean(data.degraded),
          })
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            videos: [],
            loading: false,
            error: error.message || 'Search failed. Try another phrase.',
            degraded: false,
          })
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [query])

  return (
    <div className="page wutube-page">
      <div className="wutube-section-head results-head">
        <div>
          <p className="wutube-kicker">Search</p>
          <h1>{query || 'Search WuTube'}</h1>
        </div>
        <span className="results-count">{state.videos.length} videos</span>
      </div>

      {state.degraded ? <div className="status-banner">Results are limited right now.</div> : null}
      {!query ? <EmptyState message="Use the search bar to find YouTube videos." /> : null}
      {state.loading ? <LoadingState message={`Searching for "${query}"...`} /> : null}
      {state.error ? <ErrorState message={state.error} /> : null}
      {!state.loading && !state.error && query && state.videos.length ? <VideoList videos={state.videos} /> : null}
      {!state.loading && !state.error && query && !state.videos.length ? (
        <EmptyState message="No videos came back for that search yet." />
      ) : null}
    </div>
  )
}

function WatchPage({ library }) {
  const location = useLocation()
  const videoId = location.pathname.split('/').pop()
  const { saveHistory } = library
  const [state, setState] = useState({
    payload: null,
    loading: true,
    error: '',
    degraded: false,
  })

  useEffect(() => {
    let cancelled = false

    async function load() {
      setState((current) => ({ ...current, loading: true, error: '' }))
      try {
        const data = await fetchJson(`${API_BASE}/video/${videoId}`)
        if (!cancelled) {
          setState({
            payload: data,
            loading: false,
            error: '',
            degraded: Boolean(data.degraded),
          })
          if (data.video) {
            saveHistory(data.video)
          }
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            payload: null,
            loading: false,
            error: error.message || 'This video could not be loaded right now.',
            degraded: false,
          })
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [saveHistory, videoId])

  if (state.loading) return <LoadingState message="Loading video..." />
  if (state.error || !state.payload) return <ErrorState message={state.error || 'Video unavailable.'} />

  const { video, related } = state.payload
  const inWatchLater = library.isSaved(library.watchLater, video.videoId)
  const isLiked = library.isSaved(library.liked, video.videoId)

  return (
    <div className="page wutube-page">
      <div className="watch-layout">
        <section className="watch-main">
          <div className="player-frame">
            <iframe
              src={embedUrlFor(video.videoId)}
              title={video.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
          <div className="watch-meta">
            <p className="wutube-kicker">{video.author.name}</p>
            <h1>{video.title}</h1>
            <div className="watch-stats">
              <span>{formatNumber(video.views)} views</span>
              <span>{video.ago || video.uploadDate || 'Recently uploaded'}</span>
              <span>{video.timestamp}</span>
            </div>
            {state.degraded ? (
              <div className="status-banner">Metadata is partially degraded, but playback is live.</div>
            ) : null}
            <div className="action-row">
              <button className="btn btn-secondary" type="button" onClick={() => library.toggleLiked(video)}>
                {isLiked ? 'Unlike' : 'Like'}
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => library.toggleWatchLater(video)}>
                {inWatchLater ? 'Remove Watch Later' : 'Watch Later'}
              </button>
              <a className="btn btn-primary" href={video.url} rel="noreferrer" target="_blank">
                Open on YouTube
              </a>
            </div>
            <div className="description-card">
              <p>{video.description || 'No description provided for this video.'}</p>
            </div>
          </div>
        </section>

        <aside className="watch-sidebar">
          <div className="wutube-section-head compact-head">
            <div>
              <p className="wutube-kicker">Queue</p>
              <h2>Up next</h2>
            </div>
          </div>
          <VideoList compact videos={related} />
        </aside>
      </div>
    </div>
  )
}

function LibraryPage({ library }) {
  const location = useLocation()
  const collection = location.pathname.split('/').pop()
  const config = {
    history: {
      title: 'Watch History',
      description: 'The videos you opened inside WuTube.',
      videos: library.history,
    },
    'watch-later': {
      title: 'Watch Later',
      description: 'Your saved queue of YouTube videos.',
      videos: library.watchLater,
    },
    liked: {
      title: 'Liked Videos',
      description: 'Videos you marked to keep around.',
      videos: library.liked,
    },
  }[collection]

  if (!config) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="page wutube-page">
      <div className="wutube-section-head">
        <div>
          <p className="wutube-kicker">Library</p>
          <h1>{config.title}</h1>
        </div>
        <span className="results-count">{config.videos.length} videos</span>
      </div>
      <p className="wutube-subtitle library-copy">{config.description}</p>
      {config.videos.length ? <VideoList videos={config.videos} /> : <EmptyState message={`No videos in ${config.title.toLowerCase()} yet.`} />}
    </div>
  )
}

function VideoGrid({ videos }) {
  return (
    <div className="video-grid">
      {videos.map((video) => (
        <Link className="video-card" key={video.videoId} to={`/watch/${video.videoId}`}>
          <div className="thumb-wrap">
            <img alt={video.title} src={video.thumbnail} />
            <span>{video.timestamp}</span>
          </div>
          <div className="video-copy">
            <h3>{video.title}</h3>
            <p>{video.author.name}</p>
            <p>
              {formatNumber(video.views)} views - {video.ago || 'New'}
            </p>
          </div>
        </Link>
      ))}
    </div>
  )
}

function VideoList({ videos, compact = false }) {
  return (
    <div className={compact ? 'video-list compact' : 'video-list'}>
      {videos.map((video) => (
        <Link className="list-card" key={video.videoId} to={`/watch/${video.videoId}`}>
          <div className="list-thumb">
            <img alt={video.title} src={video.thumbnail} />
            <span>{video.timestamp}</span>
          </div>
          <div className="list-copy">
            <h3>{video.title}</h3>
            <p>{video.author.name}</p>
            <p>
              {formatNumber(video.views)} views - {video.ago || 'New'}
            </p>
          </div>
        </Link>
      ))}
    </div>
  )
}

function LoadingState({ message }) {
  return <div className="state-card">{message}</div>
}

function ErrorState({ message }) {
  return <div className="state-card error">{message}</div>
}

function EmptyState({ message }) {
  return <div className="state-card empty">{message}</div>
}

export default App
