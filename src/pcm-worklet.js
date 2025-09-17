// src/pcm-worklet.js
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const ch0 = input[0];
    const ab = new ArrayBuffer(ch0.length * 2);
    const view = new DataView(ab);
    for (let i = 0; i < ch0.length; i++) {
      let s = Math.max(-1, Math.min(1, ch0[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    // Enviar al hilo principal → WebSocket
    this.port.postMessage(ab, [ab]);
    return true;
  }
}
registerProcessor("pcm-processor", PCMProcessor);
