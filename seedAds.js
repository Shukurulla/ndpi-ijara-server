
import mongoose from "mongoose";
import dotenv from "dotenv";
import adsModel from "./models/ads.model.js";

dotenv.config();

const ads = [
  {
    title: "Facebook",
    image: "public/ads/1758268394781-347910064_image.png",
    icon: "public/ads/1758268394782-912474115_image.png",
    link: "https://www.facebook.com/ndpi.official",
  },
  {
    title: "Instagram",
    image: "public/ads/1758268339404-831628157_image.png",
    icon: "public/ads/1758268339405-52123702_image.png",
    link: "https://www.instagram.com/ndpi_official/",
  },
  {
    title: "Telegram",
    image: "public/ads/1758268270619-301507728_image.png",
    icon: "public/ads/1758268270620-678387462_image.png",
    link: "https://t.me/www_ndpi_uz",
  },
  {
    title: "NDPI",
    image: "public/ads/1758268188037-987296958_image.png",
    icon: "public/ads/1758268188042-124873113_image.png",
    link: "https://ndpi.uz/uz",
  },
];

async function seedAds() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB ga ulandi");

    for (const ad of ads) {
      const created = await adsModel.create(ad);
      console.log("Qoshildi:", created.title, "->", created.link);
    }

    console.log("Tayyor!");
    process.exit(0);
  } catch (error) {
    console.error("Xatolik:", error.message);
    process.exit(1);
  }
}

seedAds();
