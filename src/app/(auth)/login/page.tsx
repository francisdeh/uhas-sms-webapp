export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F5F7]">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-8">
          <div className="w-9 h-9 rounded-lg bg-[#1E293B] flex items-center justify-center">
            <span className="text-white font-bold text-sm">U</span>
          </div>
          <div>
            <p className="font-bold text-[#1E293B] text-base leading-tight">UHAS Basic School</p>
            <p className="text-xs text-gray-400">School Management System</p>
          </div>
        </div>
        <p className="text-sm text-gray-500 text-center">Login page — coming in Phase 1</p>
      </div>
    </div>
  );
}
