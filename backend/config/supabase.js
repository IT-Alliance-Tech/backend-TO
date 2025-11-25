require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// Safety check
if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("Supabase URL or KEY missing in .env file");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

module.exports = supabase;
