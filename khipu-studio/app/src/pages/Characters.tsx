import { useCharacters } from "../hooks/useCharacters";

function CharactersPage() {
  const {
    characters,
    loading,
    saving,
    dirty,
    reloadDetection,
    addCharacter,
    removeCharacter,
    updateCharacter,
    sortByFrequency,
    save,
    load,
  } = useCharacters();

  const runDetection = () => void reloadDetection();
  const saveCharacters = () => void save();
  const add = () => addCharacter();
  const remove = (id: string) => removeCharacter(id);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Characters</h1>
          <p className="text-gray-600 text-sm">Detection, editing & voice preparation.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button onClick={load} disabled={loading} className="px-3 py-2 text-sm bg-slate-200 hover:bg-slate-300 rounded disabled:opacity-50">Reload</button>
          <button onClick={runDetection} disabled={loading} className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">Detect / Refresh</button>
          <button onClick={add} disabled={loading} className="px-3 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700">Add</button>
          <button onClick={sortByFrequency} disabled={loading || characters.length === 0} className="px-3 py-2 text-sm bg-amber-500 text-white rounded hover:bg-amber-600 disabled:opacity-50">Sort by Frequency</button>
          <button onClick={saveCharacters} disabled={saving || loading || !dirty} className="px-3 py-2 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50">{saving ? "Saving..." : "Save"}{dirty && !saving && <span className="ml-1" title="Unsaved changes">*</span>}</button>
        </div>
      </div>

      {loading && (
        <div className="mb-4 p-4 bg-slate-50 border border-slate-200 rounded animate-pulse text-sm">Loading characters…</div>
      )}

      {!loading && characters.length === 0 && (
        <div className="text-center py-16 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          <p className="text-gray-600 text-lg mb-2">No characters yet</p>
          <p className="text-gray-400 text-sm mb-4">Run detection or add manually.</p>
          <div className="flex justify-center gap-2">
            <button onClick={runDetection} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Detect</button>
            <button onClick={add} className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700">Add</button>
          </div>
        </div>
      )}

      <div className="grid gap-4">
        {characters.map(c => (
          <div key={c.id} className="border rounded-lg bg-white shadow-sm">
            <div className="p-4 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <input
                      value={c.name}
                      onChange={e => updateCharacter(c.id, { name: e.target.value })}
                      className="text-lg font-semibold bg-transparent border-b border-transparent focus:border-blue-400 focus:outline-none px-1"
                    />
                    <span className="ml-auto text-xs text-gray-400">Freq {c.frequency}%</span>
                  </div>
                  <textarea
                    value={c.description || ''}
                    onChange={e => updateCharacter(c.id, { description: e.target.value })}
                    placeholder="Description…"
                    rows={2}
                    className="w-full text-sm resize vertical border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
                <div className="flex flex-col items-end gap-2">
                  <button onClick={() => remove(c.id)} className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100">Remove</button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default CharactersPage;
