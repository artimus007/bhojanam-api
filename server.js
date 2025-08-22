import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import mongoose from 'mongoose';

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

// DB
mongoose.set('strictQuery', true);
mongoose.connect(process.env.MONGO_URI, { dbName: 'bhojanam' })
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ Mongo error', err));

// Models
const GeoPoint = {
  type: { type: String, enum: ['Point'], required: true, default: 'Point' },
  coordinates: { type: [Number], required: true } // [lng, lat]
};

const PostSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  servings: { type: Number, required: true },
  readyUntil: Date,
  location: { type: GeoPoint, index: '2dsphere', required: true },
  address: String,
  contactName: String,
  contactPhone: String,
  status: { type: String, enum: ['open', 'claimed', 'completed', 'expired'], default: 'open' }
}, { timestamps: true });

const ClaimSchema = new mongoose.Schema({
  postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
  claimerName: String,
  claimerPhone: String,
  note: String,
  status: { type: String, enum: ['accepted', 'picked', 'cancelled'], default: 'accepted' }
}, { timestamps: true });

const Post = mongoose.model('Post', PostSchema);
const Claim = mongoose.model('Claim', ClaimSchema);

// Simple key middleware
function requireKey(req, res, next) {
  const key = req.header('x-api-key');
  if (!process.env.API_KEY) return res.status(500).json({ error: 'Server key missing' });
  if (key !== process.env.API_KEY) return res.status(401).json({ error: 'Invalid API key' });
  next();
}

// Routes
app.get('/', (_, res) => res.send('🍲 Bhojanam API running'));

app.post('/posts', requireKey, async (req, res) => {
  try {
    const { title, description, servings, lat, lng, address, contactName, contactPhone, readyUntil } = req.body;
    if (!lat || !lng) return res.status(400).json({ error: 'lat & lng required' });
    const post = await Post.create({
      title,
      description,
      servings,
      address,
      contactName,
      contactPhone,
      readyUntil: readyUntil ? new Date(readyUntil) : undefined,
      location: { type: 'Point', coordinates: [Number(lng), Number(lat)] }
    });
    res.status(201).json(post);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/posts/nearby', async (req, res) => {
  try {
    const { lat, lng, km = 10 } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'lat & lng required' });
    const meters = Number(km) * 1000;
    const posts = await Post.find({
      status: 'open',
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
          $maxDistance: meters
        }
      }
    }).limit(50);
    res.json(posts);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/posts/:id', async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  res.json(post);
});

app.post('/claims', requireKey, async (req, res) => {
  try {
    const { postId, claimerName, claimerPhone, note } = req.body;
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.status !== 'open') return res.status(409).json({ error: 'Already claimed' });

    const claim = await Claim.create({ postId, claimerName, claimerPhone, note });
    post.status = 'claimed';
    await post.save();
    res.status(201).json({ claim, post });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 API on :${PORT}`));
