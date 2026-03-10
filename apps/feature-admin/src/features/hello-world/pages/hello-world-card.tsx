/**
 * Hello World Card Component
 *
 * 공개 페이지에서 사용하는 컴포넌트
 */
import { useHelloWorld } from "../hooks";

export function HelloWorldCard() {
  const { message, loading } = useHelloWorld();

  return (
    <div className="rounded-xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/20 to-purple-500/20 p-6">
      <h2 className="mb-4 text-2xl font-bold text-white">✨ Hello World Feature</h2>
      <p className="text-gray-300">{loading ? "Loading..." : message}</p>
      <div className="mt-4 text-sm text-gray-500">
        이 컴포넌트는 전체 영역(web, server, schema, admin)을 포함하는 템플릿입니다.
      </div>
    </div>
  );
}
