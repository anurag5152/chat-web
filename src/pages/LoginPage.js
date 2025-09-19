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
      // server returns safe user object (no password)
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
    <div className="flex h-screen bg-gray-100">
      <div className="w-1/2 flex flex-col justify-center items-center bg-blue-600 text-white p-10">
        <h1 className="text-5xl font-bold mb-6">ChatConnect</h1>
        <p className="text-lg text-center">Connect with friends instantly.</p>
      </div>

      <div className="w-1/2 flex flex-col justify-center items-center bg-white shadow-lg">
        <h2 className="text-3xl font-bold mb-6">Login</h2>
        <form className="w-2/3" onSubmit={handleSubmit}>
          <input
            name="email"
            type="email"
            placeholder="Email"
            value={formData.email}
            onChange={handleChange}
            className="w-full mb-4 p-3 border rounded-lg"
            required
          />
          <input
            name="password"
            type="password"
            placeholder="Password"
            value={formData.password}
            onChange={handleChange}
            className="w-full mb-6 p-3 border rounded-lg"
            required
          />
          <button type="submit" className="w-full bg-blue-600 text-white p-3 rounded-lg">Login</button>
        </form>
        {error && <p className="text-red-600 mt-2">{error}</p>}

        <p className="mt-4 text-gray-600">
          Don’t have an account?{" "}
          <span onClick={() => navigate("/signup")} className="text-blue-600 cursor-pointer">Sign up</span>
        </p>

        <p className="mt-2 text-blue-600 cursor-pointer" onClick={handleGuest}>Continue as Guest</p>
      </div>
    </div>
  );
}
