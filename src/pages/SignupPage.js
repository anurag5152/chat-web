// src/pages/SignupPage.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signup } from "../utils/api";

export default function SignupPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ username: "", email: "", password: "" });
  const [error, setError] = useState("");

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const res = await signup(formData);
      localStorage.setItem("user", JSON.stringify(res));
      navigate("/chat");
    } catch (err) {
      setError(err.message || "Something went wrong");
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <div className="md:w-1/2 w-full flex flex-col justify-center items-center bg-blue-600 text-white p-8">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">ChatConnect</h1>
        <p className="text-center max-w-md">Create your account and start chatting instantly.</p>
      </div>

      <div className="md:w-1/2 w-full flex items-center justify-center p-6 bg-gray-50">
        <div className="w-full max-w-md bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold mb-4">Sign Up</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              name="username"
              type="text"
              placeholder="Username"
              value={formData.username}
              onChange={handleChange}
              className="w-full p-3 border rounded-lg"
              required
            />
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
            <button type="submit" className="w-full bg-blue-600 text-white p-3 rounded-lg">Sign Up</button>
          </form>

          {error && <p className="text-red-600 mt-3">{error}</p>}

          <div className="mt-4 text-sm">
            Already have an account? <button onClick={() => navigate("/")} className="text-blue-600 font-medium">Login</button>
          </div>
        </div>
      </div>
    </div>
  );
}
