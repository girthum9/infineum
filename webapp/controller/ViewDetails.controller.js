sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "accrual/service/WorkflowAPI"
], function (Controller, JSONModel, MessageToast, MessageBox, WorkflowAPI) {
    "use strict";

    return Controller.extend("accrual.controller.ViewDetails", {

        onInit: function () {
            this.getOwnerComponent().getRouter().attachRoutePatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function (oEvent) {
            if (oEvent.getParameter("name") === "ViewDetails") {
                var sInstanceId = oEvent.getParameter("arguments").instantId;
                this._loadRequestData(sInstanceId);
            }
        },

        // ─── LOAD ─────────────────────────────────────────────────────────────────────

        _loadRequestData: function (sInstanceId) {
            sap.ui.core.BusyIndicator.show(0);

            WorkflowAPI.fetchWorkflowContext(sInstanceId)
                .then(function (oResponse) {
                    sap.ui.core.BusyIndicator.hide();
                    this._mapApiDataToModel(oResponse, sInstanceId);
                }.bind(this))
                .catch(function (error) {
                    sap.ui.core.BusyIndicator.hide();
                    MessageToast.show("Error loading data");
                    console.error(error);
                });
        },

        // ─── MAP DATA ─────────────────────────────────────────────────────────────────

        _mapApiDataToModel: function (oApiData, sInstanceId) {

            // ── 1. Determine primary data source ──────────────────────────────────────
            //   Priority: form_accrualSubmissionForm_2  →  startEvent.accrual
            var oForm2  = oApiData.form_accrualSubmissionForm_2 || null;
            var oStart  = (oApiData.startEvent && oApiData.startEvent.accrual) || {};

            // Use form_accrualSubmissionForm_2 when available, else fall back to startEvent
            var oSrc    = oForm2 || oStart;

            // Legacy AccrualSet action results (kept as last-resort fallbacks for header fields)
            var oAct1   = (oApiData.action_post_postSapOpuOdataSapZBTPHYPERAUTOMATIONSERVICESSrvAccuralsSet_1  &&
                           oApiData.action_post_postSapOpuOdataSapZBTPHYPERAUTOMATIONSERVICESSrvAccuralsSet_1.result  &&
                           oApiData.action_post_postSapOpuOdataSapZBTPHYPERAUTOMATIONSERVICESSrvAccuralsSet_1.result.d) || {};

            var oAct2   = (oApiData.action_post_postSapOpuOdataSapZBTPHYPERAUTOMATIONSERVICESSrvAccuralsSet_2  &&
                           oApiData.action_post_postSapOpuOdataSapZBTPHYPERAUTOMATIONSERVICESSrvAccuralsSet_2.result  &&
                           oApiData.action_post_postSapOpuOdataSapZBTPHYPERAUTOMATIONSERVICESSrvAccuralsSet_2.result.d) || {};

            // ── 2. Helper: resolve a value across multiple objects / key variants ──────
            var pick = function () {
                // arguments: obj1, key1, obj2, key2, ...  (pairs)
                for (var i = 0; i < arguments.length; i += 2) {
                    var obj = arguments[i];
                    var key = arguments[i + 1];
                    if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
                        return obj[key];
                    }
                }
                return "";
            };

            // ── 3. Resolve status from the latest AccrualSet result ───────────────────
            //   Walk through numbered AccrualSet results to find the one with the
            //   highest suffix (most recent) that has a non-empty Status.
            var sRawStatus = "";
            var sRequestNo = "";
            var sDocumentNo = "";
            Object.keys(oApiData).forEach(function (key) {
                if (/^action_post_postSapOpuOdataSapZBTPHYPERAUTOMATIONSERVICESSrvAccuralsSet_\d+$/.test(key)) {
                    var d = (oApiData[key].result && oApiData[key].result.d) || {};
                    if (d.Status) { sRawStatus  = d.Status; }
                    if (d.Requestno)  { sRequestNo  = d.Requestno; }
                    if (d.Documentno) { sDocumentNo = d.Documentno; }
                }
            });

            // ── 4. Build header data ──────────────────────────────────────────────────
            var oData = {
                instantId  : sInstanceId,

                requestNo  : sRequestNo  || pick(oAct2, "Requestno",  oAct1, "Requestno"),
                documentNo : sDocumentNo || pick(oAct2, "Documentno", oAct1, "Documentno"),

                affiliate  : pick(oSrc,  "affiliate",       oSrc,  "Affiliate",
                                  oAct2, "Companyname",     oAct1, "Companyname"),

                nameAccrual: pick(oSrc,  "nameYourAccrual", oSrc,  "NameYourAccrual",
                                  oAct2, "Accuralname",     oAct1, "Accuralname"),

                cutoffDate : pick(oSrc,  "accrualCutOffDate", oSrc, "AccrualCutOffDate",
                                  oSrc,  "accrualCutoffDateYyyymmdd"),

                companyCode: pick(oSrc,  "companyCode",     oSrc,  "CompanyCode",
                                  oAct2, "Companycode",     oAct1, "Companycode"),

                requestedBy: pick(oSrc,  "requestedBy",     oSrc,  "RequestedBy",
                                  oAct2, "Requestedby",     oAct1, "Requestedby"),

                approvedBy : pick(oSrc,  "approvedBy",      oSrc,  "ApprovedBy",
                                  oAct2, "Approvedby",      oAct1, "Approvedby"),

                requestType: pick(oSrc,  "typeOfRequest",   oSrc,  "TypeofRequest",
                                  oAct2, "Requesttype",     oAct1, "Requesttype"),

                typeOfParty: pick(oSrc,  "typeOfParty",     oSrc,  "Partytype"),

                status     : this._getStatusText(
                                 sRawStatus ||
                                 pick(oSrc, "status", oSrc, "Status")
                             ),
                statusState: this._getStatusState(
                                 sRawStatus ||
                                 pick(oSrc, "status", oSrc, "Status")
                             ),

                approverComments: pick(oAct2, "Approvercomments", oAct1, "Approvercomments",
                                        oSrc,  "approverLevel1Comments"),

                dateCreated: this._formatToday(),
                lastUpdated: this._formatToday(),

                // ── 5. Line items ─────────────────────────────────────────────────────
                //   form_accrualSubmissionForm_2.accrual_Table  →  startEvent.accrual.Accrual_Table
                items: this._transformTable(
                    (oForm2 && (oForm2.accrual_Table || oForm2.lineItems)) ||
                    oStart.Accrual_Table ||
                    []
                ),

                // ── 6. Supporting documents (resolved below) ──────────────────────────
                dmsDocuments: [],
                supportingDocumentRef: ""
            };

            // ── 7. Resolve supporting-document folder reference ───────────────────────
            //   Priority: form_accrualSubmissionForm_2.supportingDocuments
            //           → startEvent.accrual.Supporting_Documents
            //           → custom.supportingDocuments
            var sSupportingDocs =
                (oForm2  && oForm2.supportingDocuments)              ||
                (oStart  && oStart.Supporting_Documents)             ||
                (oApiData.custom && oApiData.custom.supportingDocuments) ||
                "";

            oData.supportingDocumentRef = sSupportingDocs;

            var oModel = new JSONModel(oData);
            this.getView().setModel(oModel);

            // ── 8. Fetch DMS files (read-only) ────────────────────────────────────────
            if (sSupportingDocs && sSupportingDocs.indexOf("spa-res:cmis:folderid:") === 0) {
                this._loadDMSAttachments(sSupportingDocs, oModel);
            }
        },

        // ─── DMS (READ-ONLY) ──────────────────────────────────────────────────────────

        _loadDMSAttachments: function (sSupportingDocsRef, oModel) {
            WorkflowAPI.fetchDMSFilesFromFolder(sSupportingDocsRef)
                .then(function (aDMSFiles) {
                    if (aDMSFiles && aDMSFiles.length > 0) {
                        var aMapped = aDMSFiles.map(function (doc) {
                            return {
                                objectId  : doc.objectId   || "",
                                fileName  : doc.fileName   || "",
                                fileType  : doc.fileType   || "",
                                fileSize  : doc.fileSize   || "",
                                uploadedOn: doc.uploadedOn || "",
                                folderId  : doc.folderId   || ""
                            };
                        });
                        oModel.setProperty("/dmsDocuments", aMapped);
                        oModel.updateBindings(true);
                    }
                })
                .catch(function (error) {
                    console.error("Error loading supporting documents:", error);
                    MessageToast.show("Could not load supporting documents");
                });
        },

        // ─── DOWNLOAD ONLY (no upload / delete on ViewDetails) ───────────────────────

        onDMSDownload: function (oEvent) {
            var oDoc = oEvent.getSource().getBindingContext().getObject();

            WorkflowAPI.downloadDMSFile(oDoc.objectId)
                .then(function (blob) {
                    var url = URL.createObjectURL(blob);
                    var a   = document.createElement("a");
                    a.href     = url;
                    a.download = oDoc.fileName;
                    a.click();
                    URL.revokeObjectURL(url);
                })
                .catch(function (error) {
                    MessageBox.error("Download failed: " + error.message);
                });
        },

        // ─── TABLE TRANSFORM ──────────────────────────────────────────────────────────

        _transformTable: function (aSrc) {
            if (!aSrc || !aSrc.length) { return []; }

            return aSrc.map(function (row) {
                // form_accrualSubmissionForm_2 uses camelCase keys
                // startEvent.accrual.Accrual_Table uses PascalCase keys
                return {
                    supplier      : row.supplierCustomer        || row.SupplierCustomer        || "",
                    description   : row.description             || row.Description             || "",
                    currency      : row.currency                || row.Currency                || "",
                    excludeTax    : row.excludeTax              || row.ExcludeTax              || "",
                    glAccount     : row.gLAccountCode           || row.GLAccountCode           || "",
                    creditDebit   : row.creditDebitIndicator    || row.CreditDebitIndicator    || "",
                    poNumber      : row.purchaseOrderNumber     || row.PurchaseOrderNumber     || "",
                    poLineItem    : row.purchaseOrderLineItem   || row.PurchaseOrderLineItem   || "",
                    costCentre    : row.costCentre              || row.CostCentre              || "",
                    internalOrder : row.internalOrder           || row.InternalOrder           || "",
                    wbs           : row.wBS                     || row.WBS                     || "",
                    tradingPartner: row.tradingPartner          || row.TradingPartner          || "",
                    salesOrder    : row.salesOrderNumber        || row.SalesOrderNumber        || "",
                    salesOrderItem: row.salesOrderItemNumber    || row.SalesOrderItemNumber    || "",
                    segmentProduct: row.segmentProduct          || row.SegmentProduct          || "",
                    segmentShip   : row.segmentShiptoParty      || row.SegmentShiptoParty      || "",
                    segmentSold   : row.segmentSoldtoParty      || row.SegmentSoldtoParty      || ""
                };
            });
        },

        // ─── STATUS HELPERS ───────────────────────────────────────────────────────────

        _getStatusText: function (s) {
            var map = {
                "Draft"    : "Draft",
                "Pending"  : "Pending Approval",
                "Completed": "Completed",
                "1"        : "Submitted",
                "2"        : "Draft"
            };
            return map[s] || s || "Unknown";
        },

        _getStatusState: function (s) {
            var map = {
                "Draft"    : "Warning",
                "Pending"  : "Warning",
                "Completed": "Success",
                "1"        : "Information",
                "2"        : "Warning"
            };
            return map[s] || "None";
        },

        // ─── MISC ─────────────────────────────────────────────────────────────────────

        _formatToday: function () {
            var d  = new Date();
            var dd = String(d.getDate()).padStart(2, "0");
            var mm = String(d.getMonth() + 1).padStart(2, "0");
            var yyyy = d.getFullYear();
            return dd + "/" + mm + "/" + yyyy;
        },

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("Dashboard");
        }
    });
});