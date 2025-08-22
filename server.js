import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// ================== Schema & Model ==================
const foodSchema = new mongoose.Schema({
  title: { type: String, required: true },
  quantity: { type: Number, required: true },
  location: {
    type: {
      type: String,
      enum: ["Point"],
      required: true,
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true,
    },
  },
  createdAt: { type: Date, default: Date.now },
});

// ✅ Correct way to add geospatial index
foodSchema.index({ location: "2dsphere" });

const Food = mongoose.model("Food", foodSchema);

// ================== Routes ==================

// Health check
app.get("/", (req, res) => {
  res.send("🍲 Bhojanam API is running!");
});

// Add food entry
app.post("/api/food", async (req, res) => {
  try {
    const { title, quantity, latitude, longitude } = req.body;

    const newFood = new Food({
      title,
      quantity,
      location: {
        type: "Point",
        coordinates: [longitude, latitude],
      },
    });

    await newFood.save();
    res.status(201).json(newFood);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add food" });
  }
});

// Get all food
app.get("/api/food", async (req, res) => {
  try {
    const foodList = await Food.find().sort({ createdAt: -1 });
    res.json(foodList);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch food list" });
  }
});

// Nearby food (within 5 km)
app.get("/api/food/nearby", async (req, res) => {
  try {
    const { lat, lng } = req.query;

    const nearbyFood = await Food.find({
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] },
          $maxDistance: 5000, // 5 km
        },
      },
    });

    res.json(nearbyFood);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch nearby food" });
  }
});

// ================== Server ==================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
