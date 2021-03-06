'use babel';

import { PackageManager, CompositeDisposable } from 'atom';
import QasmElementControllers from './qasm-element-controllers';
const fs = require('fs');
const { spawn } = require('child_process');

export default class QasmCircuitPreviewView {

  constructor(serializedState) {
    // Create root element
    this.element = document.createElement('div');
    this.element.classList.add('qasm-circuit-preview');

    QASM = this;

    this.subscriptions = new CompositeDisposable()

    this.qasmElementController = new QasmElementControllers()

    QASM.path = atom.packages.getPackageDirPaths() + '/qasm-circuit-preview/'

    QASM.is_dark = true;
    QASM.reverse_bits = false;

    QASM.drawer_path = QASM.path + 'helpers/qasm-drawer.py'

    editor = atom.workspace.getActiveTextEditor()
    path = editor.buffer.file.path

    QASM.elementControllers = {}

    QASM.content = document.createElement('div');
    const loader = document.createElement('div');
    QASM.content.classList.add('content');

    this.qasmElementController.createQasmElements(QASM, {"error": "div", "message": "div", "image": "img", "graph_container": "div", "graph": "img", "button_container": "div", "details": "table"})

    QASM.elementControllers.graph_selector = document.createElement('select');

    var graph_options = ["bell_state_count", "dag", "hinton", "pauli_vector_representation", "qsphere_representation", "density_matrix_cityscape"];

    for (var i = 0; i < graph_options.length; i++) {
      var graph_option = document.createElement("option");
      graph_option.value = graph_options[i];
      graph_option.text = graph_options[i].split('_').join(' ').toUpperCase();
      QASM.elementControllers.graph_selector.appendChild(graph_option);
    }

    this.elementControllers.graph_selector.onchange = function(){ QASM.reloadSRC(QASM) };

    const theme_button = document.createElement('div');
    const reload_button = document.createElement('div');
    const reverse_bits_button = document.createElement('div');

    QASM.loader = loader

    loader.innerHTML = '<div class="loader"><div></div><div></div><div></div><div></div></div>';

    theme_button.classList.add('btn');
    theme_button.classList.add('btn-primary');
    theme_button.textContent = "Toggle Dark Circuit";

    theme_button.onclick = function() {

      QASM.is_dark = !QASM.is_dark

      QASM.reloadSRC(QASM)

    };

    reload_button.classList.add('btn');
    reload_button.classList.add('btn-primary');
    reload_button.textContent = "Re-render Circuit";

    reload_button.onclick = function() {

      QASM.reloadSRC(QASM)

      QASM.requestUpdate(QASM, true);

    };

    reverse_bits_button.classList.add('btn');
    reverse_bits_button.classList.add('btn-primary');
    reverse_bits_button.textContent = "Reverse Bits";

    reverse_bits_button.onclick = function() {

      QASM.reverse_bits = !QASM.reverse_bits

      QASM.requestUpdate(QASM, true);

    };

    QASM.content.appendChild(QASM.elementControllers.error);

    tabsToAdd = { "Circuit": QASM.elementControllers.image,
                  "Details": QASM.elementControllers.details,
                  "Graph": QASM.elementControllers.graph_container,
                  "Logs": QASM.elementControllers.message
                }

    this.addTabs(QASM.content, tabsToAdd);

    QASM.elementControllers.graph_container.appendChild(QASM.elementControllers.graph_selector)
    QASM.elementControllers.graph_container.appendChild(QASM.elementControllers.graph)

    loader.style.opacity = 0;
    this.element.appendChild(QASM.content);
    this.element.appendChild(loader);

    QASM.elementControllers.button_container.appendChild(theme_button);
    QASM.elementControllers.button_container.appendChild(reload_button);
    QASM.elementControllers.button_container.appendChild(reverse_bits_button);

    this.element.appendChild(QASM.elementControllers.button_container)

    this.subscribeHandlers(QASM);

    if ("source.qasm" === editor.getGrammar().scopeName) {

      QASM.requestUpdate(QASM)

    }

  }

  // Returns an object that can be retrieved when package is activated
  serialize() {}

  // Tear down any state and detach
  destroy() {
    this.element.remove();
  }

  getElement() {
    return this.element;
  }

  requestUpdate(QASM, hard=false) {

    QASM.loader.style.opacity = 1;

    if (hard) {

      QASM.content.style.opacity = 0;

    }

    editor = atom.workspace.getActiveTextEditor()

    buffer_out = "";

    if (QASM.process) { QASM.process.kill() }

    QASM.process = new (require("atom").BufferedProcess)({

      command: "python3",
      args: [QASM.drawer_path, editor.buffer.file.path, QASM.reverse_bits, hard],

      stdout: function(out) {

        buffer_out += out;

        QASM.showOutput(buffer_out);

        QASM.reloadSRC(QASM);

        QASM.content.style.opacity = 1;
        QASM.loader.style.opacity = 0;

      },

      stderr: function(out) {

        buffer_out += out;

        QASM.elementControllers.message.textContent = buffer_out;

        QASM.reloadSRC(QASM)

        QASM.content.style.opacity = 1;
        QASM.loader.style.opacity = 0;

     }, exit: function() {

       buffer_out += "\nEXIT>"

       QASM.elementControllers.message.textContent = buffer_out;

     }

    });

  }

  generateSrc(base_name, is_dark, extension, without_date_modifier) {

    var dark_str = is_dark ? "dark" : "light";

    path = QASM.path + 'temp/' + base_name + '_' + dark_str + '.' + extension

    if (without_date_modifier) {
      return path
    }

    var d = new Date();

    return path + "?=" + d.getTime()

  }

  showOutput(out) {

    this.elementControllers.message.textContent = out;

    size = this.getDatumFromLog("SIZE", out);
    depth = this.getDatumFromLog("DEPTH", out);
    width = this.getDatumFromLog("WIDTH", out);
    tensor_factors = this.getDatumFromLog("TENSOR_FACTORS", out);

    this.elementControllers.details.innerHTML = "";

    this.insertDataRow(this.elementControllers.details, "Size", size);
    this.insertDataRow(this.elementControllers.details, "Depth", depth);
    this.insertDataRow(this.elementControllers.details, "Width", width);
    this.insertDataRow(this.elementControllers.details, "Number Of Tensor Factors", tensor_factors);

    if (out.includes("ERROR>")) {

      error_msg = out.split('ERROR>')[1].split('>')[0];
      this.elementControllers.error.textContent = error_msg;

    } else {
      this.elementControllers.error.textContent = "";
    }

  }

  getDatumFromLog(datum, log) {

    regex = new RegExp('(?:' + datum + '>) (\\d*)', 'g');

    regex_match = regex.exec(log)

    if (regex_match) {

      return regex_match[1]

    }

    return "Loading..."

  }

  insertDataRow(table, datum, value) {

    row = table.insertRow();
    datum_cell = row.insertCell(0);
    value_cell = row.insertCell(1);

    datum_cell.innerHTML = datum;
    value_cell.textContent = value;

  }

  getTitle() {
    return 'QASM Circuit Preview';
  }
  getURI() {
    return 'atom://qasm-circuit-preview';
  }
  getAllowedLocations() {
    return ["right", "bottom"];
  }
  getPreferredLocation() {
    return "right";
  }

  generateTab(tab_title, element, default_opened) {

    tab_id = tab_title.split(' ').join('_');

    tab = document.createElement("div");
    label = document.createElement("label");
    checkbox = document.createElement("input");
    tab_content = document.createElement("div");

    tab.classList.add('tab');
    tab_content.classList.add('tab-content');
    label.setAttribute("for", tab_id);
    label.textContent = tab_title;
    checkbox.id = tab_id;
    checkbox.type = "checkbox";
    checkbox.checked = default_opened;

    tab.appendChild(checkbox);
    tab.appendChild(label);
    tab.appendChild(tab_content);

    tab_content.appendChild(element);

    return tab

  }

  addTabs(parent, tabDictionary) {

    for (var tab_title in tabDictionary) {

      default_opened = (tab_title != "Logs")

      tab = this.generateTab(tab_title, tabDictionary[tab_title], default_opened);

      parent.appendChild(tab);

    }

  }

  reloadSRC(QASM) {

    QASM.elementControllers.image.src = QASM.generateSrc('circuit', QASM.is_dark, 'png');
    QASM.elementControllers.graph.src = QASM.generateSrc(QASM.elementControllers.graph_selector.value, QASM.is_dark, 'png');

    QASM.elementControllers.image.onclick = function() {

      path = QASM.generateSrc('circuit', QASM.is_dark, 'png', true);

      QASM.openImageDetail(path);

    };

    QASM.elementControllers.graph.onclick = function() {

      path = QASM.generateSrc(QASM.elementControllers.graph_selector.value, QASM.is_dark, 'png', true);

      QASM.openImageDetail(path);

    };

  }

  toggle() {
    return atom.workspace.toggle(this);
  }

  isVisible() {
    return this.visible;
  }

  openImageDetail(src) {

    atom.workspace.open(src, {
      split: "right",
      activatePane: false,
      activateItem: false,
      searchAllPanes: true
    });

  }

  subscribeHandlers(QASM) {

    this.subscriptions.add(atom.workspace.observeTextEditors((editor) => {

      if ("source.qasm" === editor.getGrammar().scopeName) {

        QASM.subscriptions.add(editor.onDidSave(() => QASM.requestUpdate(QASM)));

      }

    }));

    QASM.subscriptions.add(atom.workspace.onDidChangeActiveTextEditor((activeItem) => {

      if (activeItem) {

        if (activeItem.constructor.name == "TextEditor") {

          if ("source.qasm" === activeItem.getGrammar().scopeName) {

            QASM.requestUpdate(QASM, true)

          }

        }

      }

    }));

  }

}
