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

const categories = [
  'Trending now',
  'Music',
  'Gaming',
  'Technology',
  'Podcasts',
  'Sports',
  'Coding',
  'News',
]

const sidebarSections = [
  {
    title: 'Browse',
    items: [
      { label: 'Home', path: '/' },
      { label: 'Trending', path: '/results?search_query=trending' },
      { label: 'Music', path: '/results?search_query=music' },
      { label: 'Gaming', path: '/results?search_query=gaming' },
    ],
  },
  {
    title: 'Library',
    items: [
      { label: 'History', path: '/library/history' },
      { label: 'Watch Later', path: '/library/watch-later' },
      { label: 'Liked Videos', path: '/library/liked' },
    ],
  },
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
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }
  return response.json()
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

function App() {
  const location = useLocation()
  const [history, setHistory] = usePersistentState('wutube-history', [])
  const [watchLater, setWatchLater] = usePersistentState('wutube-watch-later', [])
  const [liked, setLiked] = usePersistentState('wutube-liked', [])

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
    <div className="app-shell">
      <Header key={headerKey} />
      <div className="app-layout">
        <Sidebar />
        <main className="content-shell">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/results" element={<SearchPage />} />
            <Route path="/watch/:videoId" element={<WatchPage library={library} />} />
            <Route path="/library/:collection" element={<LibraryPage library={library} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

function Header() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [query, setQuery] = useState(params.get('search_query') ?? '')

  function submitSearch(event) {
    event.preventDefault()
    if (!query.trim()) return
    navigate(`/results?search_query=${encodeURIComponent(query.trim())}`)
  }

  return (
    <header className="topbar">
      <Link className="brand" to="/">
        <span className="brand-mark">Wu</span>
        <span className="brand-text">Tube</span>
      </Link>
      <form className="searchbar" onSubmit={submitSearch}>
        <input
          aria-label="Search YouTube videos"
          placeholder="Search actual YouTube videos"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit">Search</button>
      </form>
      <div className="topbar-actions">
        <Link to="/library/watch-later">Watch later</Link>
        <Link to="/library/liked">Liked</Link>
      </div>
    </header>
  )
}

function Sidebar() {
  const location = useLocation()

  return (
    <aside className="sidebar">
      {sidebarSections.map((section) => (
        <div className="sidebar-section" key={section.title}>
          <p>{section.title}</p>
          {section.items.map((item) => {
            const active = location.pathname + location.search === item.path
            return (
              <Link className={active ? 'sidebar-link active' : 'sidebar-link'} key={item.label} to={item.path}>
                {item.label}
              </Link>
            )
          })}
        </div>
      ))}
    </aside>
  )
}

function HomePage() {
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
      } catch {
        if (!cancelled) {
          setState({
            sections: [],
            loading: false,
            error: 'WuTube could not load the home feed.',
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
    <div className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">Wubu video layer</p>
          <h1>WuTube, but inside the same visual system.</h1>
          <p className="hero-copy">
            Search, watch, save, and reopen YouTube videos without dropping into the generic proxy screen.
            The feed stays usable even when live metadata is acting up.
          </p>
        </div>
        <div className="hero-grid">
          {categories.map((category) => (
            <Link
              className="category-chip"
              key={category}
              to={`/results?search_query=${encodeURIComponent(category)}`}
            >
              {category}
            </Link>
          ))}
        </div>
      </section>

      {state.degraded ? (
        <div className="status-banner">WuTube is showing fallback feed data while live lookups recover.</div>
      ) : null}

      {state.loading ? <LoadingState message="Loading the WuTube home feed..." /> : null}
      {state.error ? <ErrorState message={state.error} /> : null}

      {!state.loading &&
        !state.error &&
        state.sections.map((section) => (
          <section className="feed-section" key={section.title}>
            <div className="section-heading">
              <h2>{section.title}</h2>
              <Link to={`/results?search_query=${encodeURIComponent(section.query)}`}>See more</Link>
            </div>
            <VideoGrid videos={section.videos} />
          </section>
        ))}
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
    if (!query) {
      return
    }

    let cancelled = false
    async function load() {
      setState((current) => ({ ...current, loading: true, error: '' }))
      try {
        const data = await fetchJson(`${API_BASE}/search?q=${encodeURIComponent(query)}`)
        if (!cancelled) {
          setState({
            videos: data.videos ?? [],
            loading: false,
            error: data.error && !(data.videos ?? []).length ? data.error : '',
            degraded: Boolean(data.degraded),
          })
        }
      } catch {
        if (!cancelled) {
          setState({
            videos: [],
            loading: false,
            error: 'Search failed. Try another phrase.',
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
    <div className="page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Search results</p>
          <h1>{query || 'Search WuTube'}</h1>
        </div>
        <span className="results-count">{state.videos.length} videos</span>
      </div>

      {!query ? <EmptyState message="Use the search bar to find actual YouTube videos." /> : null}
      {state.degraded ? (
        <div className="status-banner">Live search is degraded right now. Results may be limited for this query.</div>
      ) : null}
      {state.loading ? <LoadingState message={`Searching YouTube for "${query}"...`} /> : null}
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
          saveHistory(data.video)
        }
      } catch {
        if (!cancelled) {
          setState({
            payload: null,
            loading: false,
            error: 'This video could not be loaded right now.',
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
    <div className="watch-layout">
      <section className="watch-main">
        <div className="player-frame">
          <iframe
            src={`https://www.youtube.com/embed/${video.videoId}?autoplay=1&rel=0`}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
        <div className="watch-meta">
          {state.degraded ? (
            <div className="status-banner">Playback is available, but metadata is coming from WuTube fallback mode.</div>
          ) : null}
          <p className="eyebrow">{video.author.name}</p>
          <h1>{video.title}</h1>
          <div className="watch-stats">
            <span>{formatNumber(video.views)} views</span>
            <span>{video.ago || video.uploadDate || 'Recently uploaded'}</span>
            <span>{video.timestamp}</span>
          </div>
          <div className="action-row">
            <button type="button" onClick={() => library.toggleLiked(video)}>
              {isLiked ? 'Unlike' : 'Like'}
            </button>
            <button type="button" onClick={() => library.toggleWatchLater(video)}>
              {inWatchLater ? 'Remove Watch Later' : 'Watch Later'}
            </button>
            <a href={video.url} rel="noreferrer" target="_blank">
              Open on YouTube
            </a>
          </div>
          <div className="description-card">
            <p>{video.description || 'No description provided for this video.'}</p>
          </div>
        </div>
      </section>

      <aside className="watch-sidebar">
        <div className="section-heading compact">
          <h2>Up next</h2>
        </div>
        <VideoList videos={related} compact />
      </aside>
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
      description: 'Your saved queue of actual YouTube videos.',
      videos: library.watchLater,
    },
    liked: {
      title: 'Liked Videos',
      description: 'Videos you marked as worth keeping.',
      videos: library.liked,
    },
  }[collection]

  if (!config) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="page">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Library</p>
          <h1>{config.title}</h1>
        </div>
      </div>
      <p className="hero-copy">{config.description}</p>
      {config.videos.length ? (
        <VideoList videos={config.videos} />
      ) : (
        <EmptyState message={`No videos in ${config.title.toLowerCase()} yet.`} />
      )}
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
