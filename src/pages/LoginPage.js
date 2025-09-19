// src/pages/LoginPage.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../utils/api";

export default function LoginPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const res = await login(formData);
      localStorage.setItem("user", JSON.stringify(res));
      navigate("/chat");
    } catch (err) {
      setError(err.message || "Something went wrong");
    }
  };

  const handleGuest = () => {
    const guest = {
      id: `guest_${Date.now()}`,
      username: `Guest_${Math.floor(Math.random() * 10000)}`,
      email: null,
      friends: [],
      requests: [],
    };
    localStorage.setItem("user", JSON.stringify(guest));
    navigate("/chat");
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <div className="md:w-1/2 w-full flex flex-col justify-center items-center bg-blue-600 text-white p-8">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">ChatConnect</h1>
        <p className="text-center max-w-md">Connect with friends instantly. Works on mobile and desktop.</p>
      </div>

      <div className="md:w-1/2 w-full flex items-center justify-center p-6 bg-gray-50">
        <div className="w-full max-w-md bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold mb-4">Login</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              name="email"
              type="email"
              placeholder="Email"
              value={formData.email}
              onChange={handleChange}
              className="w-full p-3 border rounded-lg"
              required
            />
            <input
              name="password"
              type="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
              className="w-full p-3 border rounded-lg"
              required
            />
            <button type="submit" className="w-full bg-blue-600 text-white p-3 rounded-lg">Login</button>
          </form>

          {error && <p className="text-red-600 mt-3">{error}</p>}

          <div className="mt-4 flex justify-between items-center text-sm">
            <span>Don’t have an account? <button onClick={() => navigate("/signup")} className="text-blue-600 font-medium">Sign up</button></span>
            <button onClick={handleGuest} className="text-blue-600">Continue as Guest</button>
          </div>
        </div>
      </div>
    </div>
  );
}
