import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ====== ENV ======
const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

// ====== DB CONNECT ======
mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// ====== MODELS ======

// User
const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    email: { type: String, unique: true, required: true, lowercase: true, trim: true },
    password: { type: String, required: true },
  },
  { timestamps: true }
);
const User = mongoose.model("User", userSchema);

// Food (GeoJSON Point)
const foodSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true },
  description: { type: String, trim: true },
  location: {
    type: { type: String, enum: ["Point"], required: true },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  createdAt: { type: Date, default: Date.now },
});
foodSchema.index({ location: "2dsphere" });
const Food = mongoose.model("Food", foodSchema);

// ====== MIDDLEWARE ======
function authRequired(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.id;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ====== ROUTES ======

// Health
app.get("/", (req, res) => res.send("🍲 Bhojanam API is running!"));

// --- Auth ---
app.post("/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "Email & password required" });

    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ error: "Email already in use" });

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hash });
    res.json({ message: "User created", user: { id: user._id, name: user.name, email: user.email } });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  const user = await User.findOne({ email });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
});

// --- Food ---
app.post("/api/food", authRequired, async (req, res) => {
  try {
    const { title, quantity, latitude, longitude, description } = req.body;

    if (
      typeof title !== "string" ||
      typeof quantity !== "number" ||
      typeof latitude !== "number" ||
      typeof longitude !== "number"
    ) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const newFood = await Food.create({
      title,
      quantity,
      description,
      location: { type: "Point", coordinates: [longitude, latitude] },
      createdBy: req.userId,
    });

    res.status(201).json(newFood);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add food" });
  }
});

app.get("/api/food", async (req, res) => {
  try {
    const foodList = await Food.find().sort({ createdAt: -1 }).limit(100);
    res.json(foodList);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch food list" });
  }
});

app.get("/api/food/nearby", async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const km = parseFloat(req.query.km || "5");

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ error: "lat & lng query params required" });
    }

    const nearbyFood = await Food.find({
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: [lng, lat] },
          $maxDistance: km * 1000, // km -> meters
        },
      },
    }).limit(100);

    res.json(nearbyFood);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch nearby food" });
  }
});

// ====== START ======
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
