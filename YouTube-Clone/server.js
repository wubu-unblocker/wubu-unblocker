import cors from 'cors'
import express from 'express'
import yts from 'yt-search'

const app = express()
const port = process.env.PORT || 3001

const homeQueries = [
  { title: 'Trending now', query: 'trending videos today' },
  { title: 'Music picks', query: 'official music video new releases' },
  { title: 'Gaming live', query: 'gaming highlights 2026' },
  { title: 'Build mode', query: 'coding tutorials web development' },
]

app.use(cors())

function normalizeVideo(video) {
  return {
    videoId: video.videoId,
    url: video.url,
    title: video.title,
    description: video.description,
    thumbnail: video.thumbnail || video.image,
    views: video.views ?? 0,
    timestamp: video.timestamp || 'Live',
    seconds: video.seconds ?? 0,
    ago: video.ago,
    uploadDate: video.uploadDate,
    author: {
      name: video.author?.name || 'Unknown creator',
      url: video.author?.url || '',
    },
  }
}

async function searchVideos(query, limit = 12) {
  const result = await yts(query)
  return result.videos.slice(0, limit).map(normalizeVideo)
}

app.get('/api/home', async (_request, response) => {
  try {
    const sections = await Promise.all(
      homeQueries.map(async (section) => ({
        ...section,
        videos: await searchVideos(section.query, 8),
      })),
    )

    response.json({ sections })
  } catch {
    response.status(500).json({ error: 'Failed to load home feed.' })
  }
})

app.get('/api/search', async (request, response) => {
  const query = request.query.q?.toString().trim()
  if (!query) {
    response.status(400).json({ error: 'Missing query.' })
    return
  }

  try {
    const videos = await searchVideos(query, 18)
    response.json({ query, videos })
  } catch {
    response.status(500).json({ error: 'Search failed.' })
  }
})

app.get('/api/video/:id', async (request, response) => {
  try {
    const video = normalizeVideo(await yts({ videoId: request.params.id }))
    const relatedQuery = `${video.author.name} ${video.title}`
    const related = (await searchVideos(relatedQuery, 10)).filter(
      (candidate) => candidate.videoId !== video.videoId,
    )

    response.json({ video, related })
  } catch {
    response.status(500).json({ error: 'Video load failed.' })
  }
})

app.listen(port, () => {
  console.log(`WuTube API listening on http://localhost:${port}`)
})
