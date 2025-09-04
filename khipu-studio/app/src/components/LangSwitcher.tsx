import i18n from "../i18n";

export default function LangSwitcher() {
  const set = (lng: string) => {
    i18n.changeLanguage(lng);
    localStorage.setItem("khipu.lang", lng);
  };
  return (
    <div style={{ display: "inline-flex", gap: 8 }}>
      <button onClick={() => set("es-PE")}>ES-PE</button>
      <button onClick={() => set("en-US")}>EN</button>
    </div>
  );
}
