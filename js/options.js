import Utils from "./utils.js";
import { DefaultConfigs, DefaultAriaNgOptions } from "./config.js";

const AriaNgOptionsKey = "AriaNg.Options"; // AriaNG options local storage key

const SHORTCUTS_PAGE_URL = "chrome://extensions/shortcuts";

const ColorModeList = [
    { name: 'light', icon: 'fa-sun', title: 'LightMode' },
    { name: 'dark', icon: 'fa-moon', title: 'DarkMode' },
    { name: 'system', icon: 'fa-circle-half-stroke', title: 'FollowSystem' }
];

const OptionDeps = { // Key named option depends on the value named option
    askBeforeExport: 'contextMenus',
    checkClick: 'integration',
    keepAwake: 'monitorAria2'
}

const Mark = chrome.i18n.getMessage("Mark");
const NameStr = chrome.i18n.getMessage("Name");
const SecretKeyStr = chrome.i18n.getMessage("SecretKey");
const DownloadLocationStr = chrome.i18n.getMessage("DownloadLocation");
const MarkAsSecureTip = chrome.i18n.getMessage("MarkAsSecureTip");
const MarkAsInsecureTip = chrome.i18n.getMessage("MarkAsInsecureTip");

var Configs =
{
    init: async function () {
        Utils.localizeHtmlPage();
        if (location.search.endsWith("upgrade-storage"))
            await upgradeStorage();
        let configs = null;
        try {
            configs = await chrome.storage.local.get();
        } catch (error) {
            console.error("init: " + error.message);
        }
        Object.assign(Configs, DefaultConfigs, configs);

        setColorMode();

        $("input[type=checkbox]").prop("checked", false);
        $("input[type=text],input[type=number]").val("");
        $("textarea").val("");
        $(`#${Configs.webUIOpenStyle}`).prop('checked', true);
        $(`#${Configs.iconOffStyle}`).prop('checked', true);

        for (const checkbox of $("input[type=checkbox]")) {
            if (Configs[checkbox.id])
                checkbox.checked = Configs[checkbox.id];
        }

        Configs.rpcList.length > 1 ? $("#monitor-all").show() : $("#monitor-all").hide();

        for (const [dependent, dependency] of Object.entries(OptionDeps)) {
            $(`#${dependent}`).prop("disabled", !Configs[dependency]);
            $(`#${dependency}`).change(() => {
                $(`#${dependent}`).prop("disabled", !$(`#${dependency}`).prop("checked"));
            })
        }

        if (Utils.getPlatform() == "Windows") {
            let tooltip = chrome.i18n.getMessage("captureMagnetTip")
            $("#captureMagnet").parent().addClass("tool-tip tool-tip-icon");
        }

        for (const input of $("input[type=text],input[type=number]")) {
            if (Configs[input.id])
                input.value = Configs[input.id];
        }

        for (const textarea of $("textarea")) {
            if (Configs[textarea.id])
                textarea.value = Configs[textarea.id].join("\n");
        }

        if ($(".rpcGroup").length !== 0) {
            $(".rpcGroup").remove();
        }
        const rpcList = Configs.rpcList && Configs.rpcList.length ? Configs.rpcList
            : [{ "name": "Aria2", "url": "http://localhost:6800/jsonrpc", "pattern": "" }];

        const addBtnOrPattern = (i) => {
            return i == 0 ? `<button class="btn btn-primary" id="add-rpc"><i class="fa-solid fa-circle-plus"></i> RPC Server</button>` :
                `<input id="pattern-${i}" type="text" class="form-control col-sm-3 pattern" placeholder="URL Pattern(s) splitted by ,">`;
        };
        const rpcInputGroup = (i) => {
            return `<div class="form-group row rpcGroup">` +
                `<label class="col-form-label col-sm-2 text-info">` + (i == 0 ? `<i class="fa-solid fa-server"></i> Aria2-RPC-Server` : '') + `</label>` +
                `<div id="rpcItem-${i}" class="input-group col-sm-10">` +
                `<input id="name-${i}" type="text" class="form-control col-sm-1 name" placeholder="${NameStr} ∗" required>` +
                `<input id="secretKey-${i}" type="password" class="form-control col-sm-2 secretKey" placeholder="${SecretKeyStr}">` +
                `<input id="rpcUrl-${i}" type="url" class="form-control col-sm-4 rpcUrl" placeholder="RPC URL ∗" required>` +
                `<div id="markRpc-${i}" class="input-group-append tool-tip" tooltip-content="">
                    <button id="markButton-${i}" class="btn btn-success" type="button">
                        <i class="fa-solid fa-pencil"></i> ${Mark}
                    </button>
                 </div>` +
                `<input id="location-${i}" type="text" class="form-control col-sm-2 location" placeholder="${DownloadLocationStr}">` + addBtnOrPattern(i) +
                `</div>` +
                `</div>`;
        };
        const validate = (event) => {
            const validator = { "url": Utils.validateRpcUrl, "text": Utils.validateFilePath };
            const input = event.target;
            input.classList.remove("is-invalid", "is-valid", "is-warning");
            input.parentElement.classList.remove('tool-tip');
            input.parentElement.removeAttribute("tooltip-content");
            let result = validator[input.type](input.value);
            if (result == "VALID" || result === true) {
                input.classList.add("is-valid");
            } else if (input.value && (result == "INVALID" || result === false)) {
                input.classList.add("is-invalid");
            } else if (result == "WARNING") {
                input.classList.add("is-valid", "is-warning");
                input.parentElement.classList.add("tool-tip");
                let tooltip = chrome.i18n.getMessage("RpcUrlTooltipWarnDes");
                input.parentElement.setAttribute("tooltip-content", tooltip);
            }
        };

        for (const i in rpcList) {
            $("#rpcList").append(rpcInputGroup(i).replaceAll("required", ''));
            $(`#markRpc-${i}`).off().on('click', markRpc);
        }
        for (const i in rpcList) {
            $("#name-" + i).val(rpcList[i].name);
            let rpc = Utils.parseUrl(rpcList[i].url);
            $("#secretKey-" + i).val(rpc.secretKey);
            $("#rpcUrl-" + i).val(rpc.rpcUrl);
            $("#location-" + i).val(rpcList[i].location || '');
            if (i > 0)
                $("#pattern-" + i).val(rpcList[i].pattern || '');
            if (Utils.validateRpcUrl(rpcList[i].url) == "WARNING") {
                $(`#markRpc-${i}`).css('display', 'inline-block');
                if (rpcList[i].ignoreInsecure) {
                    $(`#markRpc-${i}`).attr('tooltip-content', MarkAsInsecureTip);
                    $(`#markButton-${i}`).removeClass('btn-warning').addClass('btn-success');
                } else {
                    let tooltipRes = '';
                    if (Configs.askBeforeDownload || Configs.askBeforeExport) {
                        tooltipRes = "ManualDownloadCookiesTooltipDes";
                    } else {
                        tooltipRes = "AutoDownloadCookiesTooltipDes";
                    }
                    let tooltip = chrome.i18n.getMessage(tooltipRes);
                    $("#rpcItem-" + i).addClass('tool-tip');
                    $("#rpcItem-" + i).attr("tooltip-content", tooltip);
                    $("#rpcUrl-" + i).addClass('is-warning');
                    $(`#markRpc-${i}`).attr('tooltip-content', MarkAsSecureTip);
                    $(`#markButton-${i}`).removeClass('btn-success').addClass('btn-warning');
                }
            }
        }

        $("#shortcuts-setting").off().on("click", function () {
            chrome.tabs.query({ "url": SHORTCUTS_PAGE_URL }).then(function (tabs) {
                if (tabs?.length > 0) {
                    chrome.windows.update(tabs[0].windowId, {
                        focused: true
                    });
                    chrome.tabs.update(tabs[0].id, {
                        active: true
                    });
                } else {
                    chrome.tabs.getCurrent().then(tab => {
                        chrome.tabs.create({
                            url: SHORTCUTS_PAGE_URL,
                            openerTabId: tab.id,
                            index: tab.index + 1
                        });
                    });
                }
            });
        });

        $("#add-rpc").off().on("click", function () {
            let i = $(".rpcGroup").length;
            let newInput = rpcInputGroup(i).replace("password", "text");
            $("#rpcList").append(newInput);
            $("#rpcUrl-" + i).on("input", validate);
            $("#location-" + i).on("input", validate);
        });

        $(".rpcGroup .rpcUrl").off().on("input", validate);
        $(".rpcGroup .location").off().on("input", validate);

        for (const button of $("button")) {
            if (Configs[button.id] || !button.onclick)
                button.onclick = Configs[button.id];
        }
        /* prevent page from refresh when submit*/
        $("form").off().on("submit", function (event) {
            event.preventDefault();
        }).on("reset", function (event) {
            event.preventDefault();
        });
        $("#webStoreUrl").prop("href", Utils.getWebStoreUrl());
        const manifest = chrome.runtime.getManifest();
        $("#version").text('v' + manifest.version);

        $("#colorMode").off().on("click", function () {
            Configs.colorModeId = (Configs.colorModeId + 1) % ColorModeList.length;
            chrome.storage.local.set({ colorModeId: Configs.colorModeId });
        });
    },
    reset: async function () {
        if (confirm(chrome.i18n.getMessage("ClearSettingsDes"))) {
            localStorage.clear();
            await chrome.storage.local.clear();
        }
    },
    save: function () {
        let rpcGroup = $(".rpcGroup");
        Configs.rpcList = [];
        for (let i = 0; i < rpcGroup.length; i++) {
            if ($("#name-" + i).val() && $("#rpcUrl-" + i).val()) {
                let rpcUrl = Utils.combineUrl($("#secretKey-" + i).val(), $("#rpcUrl-" + i).val().trim());
                if (!rpcUrl) continue;
                let location = Utils.formatFilepath($("#location-" + i).val().trim());
                Configs.rpcList.push({
                    "name": $("#name-" + i).val().trim(),
                    "url": rpcUrl,
                    "location": location || '',
                    "pattern": $("#pattern-" + i).val()?.trim() || ''
                });
            }
        }

        for (const checkbox of $("input[type=checkbox]")) {
            if (Configs.hasOwnProperty(checkbox.id))
                Configs[checkbox.id] = checkbox.checked;
        }
        for (const input of $("input[type=text],input[type=number]")) {
            if (Configs.hasOwnProperty(input.id))
                Configs[input.id] = input.value;
        }

        Configs.webUIOpenStyle = $("[name=webUIOpenStyle]:checked").val();
        Configs.iconOffStyle = $("[name=iconOffStyle]:checked").val();

        for (const textarea of $("textarea")) {
            Configs[textarea.id] = textarea.value.trim().split("\n");
            // clear the repeat record using Set object
            let tempSet = new Set(Configs[textarea.id]);
            tempSet.delete("");
            Configs[textarea.id] = Array.from(tempSet);
        }
        let { init, reset, save, upload, download, notifySyncResult, ...confs } = Configs;
        chrome.storage.local.set(confs).catch((e) => { console.error("Cannot store configs. ", e); });
    },
    upload: function () {
        try {
            let ariaNgOptionsValue = localStorage.getItem(AriaNgOptionsKey);
            if (typeof ariaNgOptionsValue === "string") {
                Configs.ariaNgOptions = JSON.parse(ariaNgOptionsValue);
            }
        } catch {
            Configs.ariaNgOptions = DefaultAriaNgOptions;
            console.warn("Upload: Local AriaNG options is invalid, default is loaded.");
        }
        //check the validity of RPC list
        if (!Configs.rpcList || !Configs.rpcList.length) {
            let str = chrome.i18n.getMessage("uploadConfigWarn");
            if (!confirm(str))
                return;
        }
        let { init, reset, save, upload, download, notifySyncResult, ...confs } = Configs;
        chrome.storage.sync.set(confs).then(() => {
            let str = chrome.i18n.getMessage("uploadConfigSucceed");
            Configs.notifySyncResult(str, "alert-success");
        }).catch(error => {
            let str = chrome.i18n.getMessage("uploadConfigFailed");
            if (error.message.includes("QUOTA_BYTES_PER_ITEM")) {
                /* There must be too many BT trackers in the Aria2 settings */
                error.message = "Exceeded Quota (8KB). Please refine the Aria2 BT trackers."
            }
            Configs.notifySyncResult(`${str} (${error.message})`, "alert-danger", 5000);
        });
    },
    download: function () {
        chrome.storage.sync.get().then(async configs => {
            if (Object.keys(configs).length > 0) {
                try {
                    if (typeof configs.ariaNgOptions === "string") {
                        configs.ariaNgOptions = JSON.parse(configs.ariaNgOptions);
                    }
                    const optionsLength = Object.keys(configs.ariaNgOptions).length;
                    const defaultLength = Object.keys(DefaultAriaNgOptions).length;
                    if (optionsLength >= defaultLength) {
                        localStorage.setItem(AriaNgOptionsKey, JSON.stringify(configs.ariaNgOptions));
                    } else {
                        throw new TypeError("Invalid AriaNG options");
                    }
                } catch {
                    delete configs.ariaNgOptions;
                    console.warn("Download: AriaNG options is invalid.");
                }
                Object.assign(Configs, configs);
                await chrome.storage.local.set(Configs);
                let str = chrome.i18n.getMessage("downloadConfigSucceed");
                Configs.notifySyncResult(str, "alert-success");
            } else {
                throw new TypeError("Invalid extension configs");
            }
        }).catch((error) => {
            let str = chrome.i18n.getMessage("downloadConfigFailed");
            Configs.notifySyncResult(str, "alert-danger", 5000);
        });
    },
    notifySyncResult: function (msg, style, timeout = 2000) {
        $("#sync-result").addClass(style);
        $("#sync-result").text(msg);
        setTimeout(function () {
            $("#sync-result").text("");
            $("#sync-result").removeClass(style);
        }, timeout);
    }
};

window.onload = Configs.init;
window.matchMedia('(prefers-color-scheme: dark)').onchange = setColorMode;

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName == "local") {
        if (Object.keys(changes).length == 1 && changes.hasOwnProperty('colorModeId')) {
            /* Only call setColorMode to avoid breaking the rpc list's transition animation */
            setColorMode();
            return;
        }
        Configs.init();
        if (isRpcListChanged(changes) && !changes.hasOwnProperty("ariaNgOptions")) {
            let oldAriaNgOptions = localStorage[AriaNgOptionsKey];
            let ariaNgOptions = null;
            try {
                ariaNgOptions = JSON.parse(oldAriaNgOptions);
            } catch (error) {
                console.warn("The stored AriaNG options is null or invalid.")
            }
            let newAriaNgOptions = JSON.stringify(Utils.exportRpcToAriaNg(changes.rpcList.newValue, ariaNgOptions));
            let str = chrome.i18n.getMessage("OverwriteAriaNgRpcWarn");
            if (newAriaNgOptions != oldAriaNgOptions && confirm(str)) {
                localStorage[AriaNgOptionsKey] = newAriaNgOptions;
            }
        }
        if (changes.captureMagnet)
            toggleMagnetHandler(changes.captureMagnet.newValue);
    }
});

window.onkeyup = function (e) {
    if (e.altKey) {
        let button;
        if (e.key == 's') {
            Configs.save();
            button = document.getElementById("save");
        } else if (e.key == 'r') {
            Configs.reset();
            button = document.getElementById("reset");
        } else if (e.key == 'u') {
            Configs.upload();
            button = document.getElementById("uploadConfig");
        } else if (e.key == 'j') {
            Configs.download();
            button = document.getElementById("downloadConfig");
        }
        button?.focus({ focusVisible: true });
    }
}

function isRpcListChanged(changes) {
    if (changes && changes.rpcList && changes.rpcList.newValue) {
        let oldList = changes.rpcList.oldValue;
        let newList = changes.rpcList.newValue;
        if (oldList?.length != newList?.length) {
            return true;
        } else {
            for (let i in newList) {
                if (newList[i].name != oldList[i].name || newList[i].url != oldList[i].url ||
                    (newList[i].pattern == '*' && oldList[i].pattern != '*')) {
                    return true;
                }
            }
        }
        return false;
    }
}

/**
 * toggle magnet protocol handler before changing the captureMagnet storage value
 *
 * @param {boolean} flag Set true to register, false to unregister
 */
function toggleMagnetHandler(flag) {
    let magnetPage = chrome.runtime.getURL("magnet.html") + "?action=magnet&url=%s";
    if (flag) {
        // TODO: replace navigator.registerProtocolHandler("magnet", magnetPage, "Capture Magnet");
    } else {
        // TODO: replace navigator.unregisterProtocolHandler("magnet", magnetPage);
    }
}

/**
 * Migrate extension settings from web local storage to Chrome local storage
 */
async function upgradeStorage() {
    let configs = await chrome.storage.local.get("rpcList");
    if (configs.rpcList) return;
    let convertMap = {
        white_site: "allowedSites",
        black_site: "blockedSites",
        white_ext: "allowedExts",
        black_ext: "blockedExts",
        rpc_list: "rpcList",
        newwindow: "window",
        newtab: "tab"
    }
    for (let [k, v] of Object.entries(localStorage)) {
        if (convertMap[k])
            k = convertMap[k]

        if (convertMap[v])
            v = convertMap[v]

        if (k.startsWith("AriaNg"))
            continue;

        if (v == "true")
            configs[k] = true;
        else if (v == "false")
            configs[k] = false;
        else if (/\[.*\]|\{.*\}/.test(v))
            configs[k] = JSON.parse(v);
        else
            configs[k] = v;
    }
    chrome.storage.local.set(configs).then(
        () => console.log("Storage upgrade completed.")
    );
}

function setColorMode() {
    switch (Configs.colorModeId) {
        case 0:
            $('html').removeClass("dark-mode");
            break;
        case 1:
            $('html').addClass("dark-mode");
            break;
        case 2:
            if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                $('html').addClass("dark-mode");
            } else {
                $('html').removeClass("dark-mode");
            }
            break;
    }
    let title = chrome.i18n.getMessage(ColorModeList[Configs.colorModeId].title);
    $("#colorMode .fa").removeClass('fa-moon fa-sun fa-circle-half-stroke')
        .addClass(ColorModeList[Configs.colorModeId].icon).attr("title", title);
}

function markRpc(event) {
    let rpcIndex = event.delegateTarget.id.split('-')[1];
    if (rpcIndex in Configs.rpcList) {
        Configs.rpcList[rpcIndex].ignoreInsecure = !Configs.rpcList[rpcIndex].ignoreInsecure;
        let { init, reset, save, upload, download, notifySyncResult, ...confs } = Configs;
        chrome.storage.local.set(confs);
    }
}
