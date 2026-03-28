import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { loginUser, registerUser } from "../services/authService";
import { useAuthStore } from "../store/useAuthStore";

type Mode = "login" | "signup";

export function AuthScreen() {
  const setSession = useAuthStore((state) => state.setSession);

  const [mode, setMode] = useState<Mode>("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | undefined>();

  const submit = async () => {
    if (!email.trim() || !password.trim()) {
      setMessage("Email and password are required.");
      return;
    }

    if (password.length < 8) {
      setMessage("Password must be at least 8 characters.");
      return;
    }

    setBusy(true);
    setMessage(undefined);

    try {
      if (mode === "signup") {
        await registerUser({
          email: email.trim(),
          password,
          fullName: fullName.trim() || undefined
        });

        setMode("login");
        setPassword("");
        setMessage("Account created successfully. Please log in.");
        return;
      }

      const loggedIn = await loginUser({
        email: email.trim(),
        password
      });

      setSession({
        token: loggedIn.token,
        user: {
          id: loggedIn.user.id,
          email: loggedIn.user.email,
          fullName: loggedIn.user.fullName ?? undefined
        }
      });
    } catch (error) {
      const text = error instanceof Error ? error.message : "Authentication failed.";
      setMessage(text);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-[#f3f4f6] px-5"
      contentContainerStyle={{ flexGrow: 1, paddingTop: 32, paddingBottom: 56 }}
    >
      <View className="absolute -left-12 -top-8 h-40 w-40 rounded-full bg-[#ffbfa5] opacity-75" />
      <View className="absolute -right-12 top-28 h-36 w-36 rounded-full bg-[#bcd5ff] opacity-75" />

      <Text className="text-3xl font-black text-[#111827]">NavDot</Text>

      <View style={{ flex: 1, justifyContent: "center" }}>
        <Text className="mb-3 text-sm text-[#4b5563]">Sign in to access pairing, navigation and sync features.</Text>
        <View className="rounded-3xl border border-[#e5e7eb] bg-white p-5">
          <View className="flex-row rounded-xl border border-[#e5e7eb] p-1">
            <Pressable
              className={`flex-1 rounded-lg py-2 ${mode === "login" ? "bg-[#fc4c02]" : "bg-transparent"}`}
              onPress={() => setMode("login")}
            >
              <Text className={`text-center font-bold ${mode === "login" ? "text-white" : "text-[#6b7280]"}`}>Login</Text>
            </Pressable>
            <Pressable
              className={`flex-1 rounded-lg py-2 ${mode === "signup" ? "bg-[#fc4c02]" : "bg-transparent"}`}
              onPress={() => setMode("signup")}
            >
              <Text className={`text-center font-bold ${mode === "signup" ? "text-white" : "text-[#6b7280]"}`}>Sign Up</Text>
            </Pressable>
          </View>

          {mode === "signup" ? (
            <View className="mt-4">
              <Text className="mb-1 text-xs font-bold uppercase tracking-wide text-[#6b7280]">Full Name</Text>
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder="Your name"
                placeholderTextColor="#9ca3af"
                className="rounded-xl border border-[#d1d5db] bg-[#f9fafb] px-3 py-3 text-[#111827]"
              />
            </View>
          ) : null}

          <View className="mt-4">
            <Text className="mb-1 text-xs font-bold uppercase tracking-wide text-[#6b7280]">Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor="#9ca3af"
              className="rounded-xl border border-[#d1d5db] bg-[#f9fafb] px-3 py-3 text-[#111827]"
            />
          </View>

          <View className="mt-4">
            <Text className="mb-1 text-xs font-bold uppercase tracking-wide text-[#6b7280]">Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Minimum 8 characters"
              placeholderTextColor="#9ca3af"
              className="rounded-xl border border-[#d1d5db] bg-[#f9fafb] px-3 py-3 text-[#111827]"
            />
          </View>

          <Pressable className="mt-5 rounded-2xl bg-[#111827] px-4 py-3" onPress={() => void submit()} disabled={busy}>
            {busy ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-center font-bold text-white">{mode === "login" ? "Login" : "Create Account"}</Text>
            )}
          </Pressable>

          {message ? <Text className="mt-3 text-sm text-[#dc2626]">{message}</Text> : null}
        </View>
      </View>
    </ScrollView>
  );
}
