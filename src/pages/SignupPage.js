import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signup } from "../utils/api";

export default function SignupPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ username: "", email: "", password: "" });
  const [error, setError] = useState("");

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.placeholder.toLowerCase()]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const res = await signup(formData);
      if (res.message === "Signup successful") {
        localStorage.setItem("user", JSON.stringify(res.user));
        navigate("/chat");
      } else {
        setError(res.message);
      }
    } catch (err) {
      setError("Something went wrong");
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Left Section */}
      <div className="w-1/2 flex flex-col justify-center items-center bg-blue-600 text-white p-10">
        <h1 className="text-5xl font-bold mb-6 fade-in-title">ChatConnect</h1>
        <p className="text-lg fade-in-desc text-center">
          Create your account and start chatting instantly.  
          Connect with friends, share moments, and enjoy seamless messaging.
        </p>
      </div>

      {/* Right Section */}
      <div className="w-1/2 flex flex-col justify-center items-center bg-white shadow-lg">
        <h2 className="text-3xl font-bold mb-6">Sign Up</h2>
        <form className="w-2/3" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Username"
            onChange={handleChange}
            className="w-full mb-4 p-3 border rounded-lg"
          />
          <input
            type="email"
            placeholder="Email"
            onChange={handleChange}
            className="w-full mb-4 p-3 border rounded-lg"
          />
          <input
            type="password"
            placeholder="Password"
            onChange={handleChange}
            className="w-full mb-6 p-3 border rounded-lg"
          />
          <button type="submit" className="w-full bg-blue-600 text-white p-3 rounded-lg">
            Sign Up
          </button>
        </form>
        {error && <p className="text-red-600 mt-2">{error}</p>}
        <p className="mt-4 text-gray-600">
          Already have an account?{" "}
          <span onClick={() => navigate("/")} className="text-blue-600 cursor-pointer">
            Login
          </span>
        </p>
      </div>

      <style>{`
        .fade-in-title { animation: fadeIn 2s ease-in-out forwards; }
        .fade-in-desc { opacity: 0; animation: fadeIn 4s ease-in-out forwards; animation-delay: 1s; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
