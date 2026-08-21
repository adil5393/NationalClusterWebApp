import axios from "axios";

const BASE_URL = import.meta.env.REACT_APP_BACKEND_URL ?? "";

export const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  headers: { "Content-Type": "application/json" },
});
