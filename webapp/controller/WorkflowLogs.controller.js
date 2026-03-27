sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/base/Log",
    "sap/m/MessageBox",
    "sap/ui/core/format/DateFormat",
    "sap/m/MessageToast",
    "accrual/service/WorkflowAPI"
], function (Controller, JSONModel, Log, MessageBox, DateFormat, MessageToast, WorkflowAPI) {
    "use strict";

    return Controller.extend("accrual.controller.WorkflowLogs", {

        onInit: function () {
            var oViewModel = new JSONModel({
                logs: [],
                busy: false,
                errorMessage: "",
                hasError: false
            });
            this.getView().setModel(oViewModel, "viewModel");

            var style = document.createElement("style");
            style.textContent = ".largeBackButton .sapMBtnIcon { font-size: 1.5rem !important; }";
            document.head.appendChild(style);

            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("WorkflowLogs").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function (oEvent) {
            var instantId = oEvent.getParameter("arguments").instantId;
            var oViewModel = this.getView().getModel("viewModel");

            if (instantId) {
                this._currentInstantId = instantId;
                this.fetchLogs(instantId);
            } else {
                oViewModel.setProperty("/hasError", true);
                oViewModel.setProperty("/errorMessage", "No instant ID provided");
            }
        },

        fetchLogs: async function (instantId) {
            if (!instantId) {
                return;
            }

            var oViewModel = this.getView().getModel("viewModel");
            oViewModel.setProperty("/busy", true);
            oViewModel.setProperty("/hasError", false);
            oViewModel.setProperty("/errorMessage", "");

            try {
                var logs = await WorkflowAPI.fetchWorkflowLogs(instantId);
                oViewModel.setProperty("/logs", logs);
            } catch (error) {
                Log.error("Controller: Error handling logs:", error);
                oViewModel.setProperty("/hasError", true);
                oViewModel.setProperty("/errorMessage", "Failed to load workflow logs: " + error.message);
                // Clear old data so user does not see stale row when fetch fails
                oViewModel.setProperty("/logs", []);
            } finally {
                oViewModel.setProperty("/busy", false);
            }
        },

        onRefresh: function () {
            if (this._currentInstantId) {
                this.fetchLogs(this._currentInstantId);
                MessageToast.show("Refreshing logs...");
            }
        },

        onNavBack: function () {
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo("Dashboard", {}, true);
        },

        // dd/MM/yy HH:mm formatter
        formatDate: function (oDate) {
            if (!oDate) {
                return "";
            }

            var oDateFormat = DateFormat.getDateTimeInstance({
                pattern: "dd/MM/yy HH:mm"
            }); // UI5 date formatting API [web:57][web:60]

            return oDateFormat.format(oDate);
        },

        getActionIcon: function (sAction) {
            var iconMap = {
                "Draft": "sap-icon://create",
                "Pending": "sap-icon://pending",
                "Approved": "sap-icon://accept",
                "Completed": "sap-icon://complete",
                "Rejected": "sap-icon://decline"
            };

            return iconMap[sAction] || "sap-icon://workflow-tasks";
        },

        getActionColor: function (sAction) {
            var colorMap = {
                "Draft": "#6a6d70",
                "Pending": "#e9730c",
                "Approved": "#2b7d2b",
                "Completed": "#1a9898",
                "Rejected": "#bb0000"
            };

            return colorMap[sAction] || "#0070f2";
        },

        getActionState: function (sAction) {
            var stateMap = {
                "Draft": "None",
                "Pending": "Warning",
                "Approved": "Success",
                "Completed": "Success",
                "Rejected": "Error"
            };

            return stateMap[sAction] || "None";
        }
    });
});
