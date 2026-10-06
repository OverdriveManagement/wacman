// Faux serveur de l'API Messages d'Anthropic (streaming SSE) pour tester l'assistant en local.
import http from "node:http";

const send = (res, type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

http
  .createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    const j = JSON.parse(body || "{}");
    // appels ponctuels à outil imposé (extraction d'un CR d'atelier, brouillon de faits marquants) : réponse JSON non diffusée
    if (!j.stream && j.tool_choice?.type === "tool") {
      const user = JSON.stringify(j.messages ?? []);
      const input =
        j.tool_choice.name === "proposer_suivi"
          ? {
              actions: [
                { title: "Envoyer le plan d'adressage IPAM", party: "CLIENT", owner: "Inconnu Test", stream: "Réseau", dueDate: "2026-10-15", source: "La Poste envoie le plan IPAM avant le 15" },
                { title: "Planifier l'atelier de recette", party: "WIFIRST", source: "Wifirst organise la recette" },
              ],
              cards: [{ title: "Recette IPAM", description: "Recette du plan d'adressage", stream: "zzz", source: "Une recette IPAM est à prévoir" }],
              decisions: [{ title: "Le lot 1 démarre le 20 octobre", status: "TAKEN", source: "Validé en séance" }],
            }
          : { highlights: [{ title: "Avancement du sprint", detail: "Deux livrables terminés.\nUne carte passée en alerte.", stream: "", type: "" }, { title: "Point de vigilance", detail: "Prérequis en attente." }] };
      console.log("tool", j.tool_choice.name, user.length);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: "msg_t", type: "message", role: "assistant", model: j.model, content: [{ type: "tool_use", id: "tu_x", name: j.tool_choice.name, input }], stop_reason: "tool_use", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 20 } }));
      return;
    }
    const toolResults = (j.messages ?? []).filter((m) => Array.isArray(m.content) && m.content.some((b) => b.type === "tool_result")).length;
    console.log("call", req.url, "turn", toolResults, "stream", j.stream);
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    send(res, "message_start", { message: { id: "msg_1", type: "message", role: "assistant", model: j.model, content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } });
    const text = toolResults === 0 ? "Je consulte le compte." : toolResults === 1 ? "Je lis les cartes." : "Voici la synthèse :\n\n- **Carte A** en alerte\n- Carte B [lien](example.com)\n\nFin.";
    send(res, "content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    for (const w of text.match(/.{1,6}/gs)) {
      send(res, "content_block_delta", { index: 0, delta: { type: "text_delta", text: w } });
      await sleep(20);
    }
    send(res, "content_block_stop", { index: 0 });
    if (toolResults < 2) {
      const name = toolResults === 0 ? "get_overview" : "list_cards";
      send(res, "content_block_start", { index: 1, content_block: { type: "tool_use", id: `tu_${toolResults}`, name, input: {} } });
      send(res, "content_block_delta", { index: 1, delta: { type: "input_json_delta", partial_json: toolResults === 1 ? '{"alertOnly": true}' : "{}" } });
      send(res, "content_block_stop", { index: 1 });
      send(res, "message_delta", { delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 20 } });
    } else {
      send(res, "message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 20 } });
    }
    send(res, "message_stop", {});
    res.end();
  })
  .listen(4900, () => console.log("mock anthropic on 4900"));
