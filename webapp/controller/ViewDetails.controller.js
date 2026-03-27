sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/thirdparty/jquery"
], function (Controller, JSONModel, jQuery) {
    "use strict";

    return Controller.extend("accrual.controller.ViewDetails", {

        onInit: function () {
            this.getOwnerComponent().getRouter().attachRoutePatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function (oEvent) {
            if (oEvent.getParameter("name") === "ViewDetails") {
                const sInstanceId = oEvent.getParameter("arguments").instantId;
                this._loadRequestData(sInstanceId);
            }
        },

        _loadRequestData: function (sInstanceId) {
            const sApiEndpoint =
                "https://is-apim-dev.test01.apimanagement.eu20.hana.ondemand.com/public/workflow/rest/v1/workflow-instances/"
                + sInstanceId + "/context";

            sap.ui.core.BusyIndicator.show();

            jQuery.ajax({
                url: sApiEndpoint,
                method: "GET",
                headers: {
                    "Authorization": "Bearer <token>",   // put real token
                    "Accept": "application/json"
                },
                success: function (oResponse) {
                    sap.ui.core.BusyIndicator.hide();
                    this._mapApiDataToModel(oResponse, sInstanceId);
                }.bind(this),
                error: function (oError) {
                    sap.ui.core.BusyIndicator.hide();
                    sap.m.MessageToast.show("Error loading data");
                    console.error(oError);
                }
            });
        },

        _formatToday: function () {
            const d = new Date();
            const dd = String(d.getDate()).padStart(2, "0");
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            const yyyy = d.getFullYear();
            return dd + "/" + mm + "/" + yyyy;
        },

        _mapApiDataToModel: function (oApiData, sInstanceId) {
            const oForm = oApiData.form_accrualSubmissionForm_1 || {};
            const oStart = (oApiData.startEvent && oApiData.startEvent.accrual) || {};
            const oAct1 = oApiData.action_post_postSapOpuOdataSapZBTPHYPERAUTOMATIONSERVICESSrvAccuralsSet_1?.result?.d || {};
            const oAct2 = oApiData.action_post_postSapOpuOdataSapZBTPHYPERAUTOMATIONSERVICESSrvAccuralsSet_2?.result?.d || {};

            // header fields
            const oData = {
                instantId  : sInstanceId,
                requestNo  : oAct2.Requestno || oAct1.Requestno || "",
                affiliate  : oStart.Affiliate || oForm.affiliate || oAct2.Companyname || oAct1.Companyname || "",
                nameAccrual: oStart.NameYourAccrual || oForm.nameYourAccrual || oAct2.Accuralname || oAct1.Accuralname || "",
                cutoffDate : oStart.AccrualCutOffDate || oForm.accrualCutOffDate || "",
                companyCode: oStart.CompanyCode || oForm.companyCode || oAct2.Companycode || oAct1.Companycode || "",
                requestedBy: oStart.RequestedBy || oForm.requestedBy || oAct2.Requestedby || oAct1.Requestedby || "",
                approvedBy : oStart.ApprovedBy || oForm.approvedBy || oAct2.Approvedby || oAct1.Approvedby || "",
                requestType: oStart.TypeofRequest || oForm.typeOfRequest || oAct2.Requesttype || oAct1.Requesttype || "",
                typeOfParty: oStart.TypeOfParty || oForm.typeOfParty || oStart.Partytype || oForm.Partytype ||"",

                status     : this._getStatusText(oAct2.Status || oAct1.Status || oStart.Status || oForm.status || ""),
                statusState: this._getStatusState(oAct2.Status || oAct1.Status || oStart.Status || oForm.status || ""),

                dateCreated: this._formatToday(),
                lastUpdated: this._formatToday(),

                // line items from Accrual_Table / accrual_Table
                items: this._transformTable(oStart.Accrual_Table || oForm.accrual_Table || []),

                approverComments: oAct2.Approvercomments || oAct1.Approvercomments || ""
            };

            const oModel = new JSONModel(oData);
            this.getView().setModel(oModel);
        },

        _transformTable: function (aSrc) {
            return aSrc.map(function (row) {
                return {
                    supplier       : row.SupplierCustomer   || row.supplierCustomer   || "",
                    description    : row.Description        || row.description        || "",
                    currency       : row.Currency           || row.currency           || "",
                    excludeTax     : row.ExcludeTax         || row.excludeTax         || "",
                    glAccount      : row.GLAccountCode      || row.gLAccountCode      || "",
                    creditDebit    : row.CreditDebitIndicator || row.creditDebitIndicator || "",
                    poNumber       : row.PurchaseOrderNumber || row.purchaseOrderNumber || "",
                    costCentre     : row.CostCentre         || row.costCentre         || "",
                    internalOrder  : row.InternalOrder      || "",
                    wbs            : row.WBS                || "",
                    tradingPartner : row.TradingPartner     || "",
                    salesOrder     : row.SalesOrderNumber   || "",
                    salesOrderItem : row.SalesOrderItemNumber || "",
                    segmentProduct : row.SegmentProduct     || "",
                    segmentShip    : row.SegmentShiptoParty || "",
                    segmentSold    : row.SegmentSoldtoParty || ""
                };
            });
        },

        _getStatusText: function (s) {
            const map = {
                "Draft"  : "Draft",
                "Pending": "Pending Approval",
                "1"      : "Submitted"
            };
            return map[s] || s || "Unknown";
        },

        _getStatusState: function (s) {
            const map = {
                "Draft"  : "Warning",
                "Pending": "Warning",
                "1"      : "Information"
            };
            return map[s] || "None";
        },

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("Dashboard");
        }
    });
});
