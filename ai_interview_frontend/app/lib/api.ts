import axios from "axios";

// This centralized client automatically points to your FastAPI server
export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000",
});

// PHASE 3 PREPARATION: The JWT Interceptor
// When you implement authentication later, you will uncomment this.
// It will automatically attach the token to every request your frontend makes.
apiClient.interceptors.request.use((config) => {
  // const token = localStorage.getItem("jwt_token"); // Or get from cookies
  // if (token) {
  //   config.headers.Authorization = `Bearer ${token}`;
  // }
  return config;
});