sap.ui.define([
    "accrual/config/Environment"
], function (Environment) {
    "use strict";

    var CONFIG = {
//------------------------  Development--------------------------------------------
        DEV: {

            apiHost: "https://is-apim-dev.test01.apimanagement.eu20.hana.ondemand.com",

            credentials: {
                username: "S_DS4130_API",
                password: "A7y2?HQR9=5%C!05"
            },

            workflowServicePath: "/ZBTP_HYPERAUTOMATION_SERVICES_SRV",
            workflowInstancePath: "/public/workflow/rest/v1/workflow-instances",
            taskInstancePath: "/public/workflow/rest/v1/task-instances",

            businessPartnerPath: "/dev/API_BUSINESS_PARTNER",
            companyCodePath: "/C_COMPANYCODEVALUEHELPPROJ_CDS/C_CompanyCodeValueHelpProj",
            glAccountPath: "/C_GLACCOUNTVALUEHELP_CDS/C_GLAccountValueHelp",
            purchaseOrderPath: "/C_PURCHASEORDER_FS_SRV/C_PurchaseOrderFs",
            purchaseOrderItemPath: "/C_PURCHASEORDER_FS_SRV/I_PurchaseOrderItem",

            costCentrePath: "/FCO_MANAGE_COST_CENTERS_SRV/C_CostCenter",
            internalOrderPath: "/FCO_INTERNAL_ORDER_SRV/InternalOrderSet",
            salesOrderPath: "/API_SALES_ORDER_SRV/A_SalesOrderItem",
            currencyPath: "/UI_CURRENCYEXCHANGERATE/I_Currency?$top=200",
            segmentPath: "/MD_PRODUCT_OP_SRV/C_ProductObjPgSalesOrder",

            dashboard: {
                accrualApiPath: "/ZBTP_HYPERAUTOMATION_SERVICES_SRV/AccrualsSet",
                recallApiPath: "/http/Accrual/Process"
            },

            auth: {
                uaa: {
                    url: "https://development-zce2p8yp.authentication.eu20.hana.ondemand.com",
                    clientId: "sb-babbf665-486d-4047-9f85-9283b0ec2896!b69304|xsuaa!b47942",
                    clientSecret: "50e3dff7-ea11-44a5-b63b-b56142d5fb8e$WbzdhEObla2jUBNDKWLdON-13dSBJVS4PVXdSS2j7tk="
                },
                dms: {
                    repositoryId: "1a95e926-8dff-43f3-a0dc-be3646683c55",
                    clientId: "sb-0b07ab86-da06-48c2-aaff-cd70c3986dde!b69304|sdm-di-DocumentManagement-sdm_integration!b873",
                    clientSecret: "e54bee4d-305a-4b5a-bfd3-fcdb7154dc35$wrq9Ite3DTvTUTeCKfK_gbBeJy9sBdU39JKWTNfk-LM=",
                    tokenUrl: "https://development-zce2p8yp.authentication.eu20.hana.ondemand.com/oauth/token"
                }
            },

            processAutomation: {
                definitionId: "us10.e84e1793trial.infineumaccrual4.accrual_Process"
            }

        },

//------------------------  Quality--------------------------------------------
        QA: {

            apiHost: "https://is-apim-qa.test01.apimanagement.eu20.hana.ondemand.com",

            credentials: {
                username: "S_DS5100_API",
                password: "TuaWE*W'2]78B9eh"
            },

            workflowServicePath: "/ZBTP_HYPERAUTOMATION_SERVICES_SRV",
            workflowInstancePath: "/public/workflow/rest/v1/workflow-instances",
            taskInstancePath: "/public/workflow/rest/v1/task-instances",

            businessPartnerPath: "/API_BUSINESS_PARTNER",
            companyCodePath: "/C_COMPANYCODEVALUEHELPPROJ_CDS/C_CompanyCodeValueHelpProj",
            glAccountPath: "/C_GLACCOUNTVALUEHELP_CDS/C_GLAccountValueHelp",
            purchaseOrderPath: "/C_PURCHASEORDER_FS_SRV/C_PurchaseOrderFs",
            purchaseOrderItemPath: "/C_PURCHASEORDER_FS_SRV/I_PurchaseOrderItem",

            costCentrePath: "/FCO_MANAGE_COST_CENTERS_SRV/C_CostCenter",
            internalOrderPath: "/FCO_INTERNAL_ORDER_SRV/InternalOrderSet",
            salesOrderPath: "/API_SALES_ORDER_SRV/A_SalesOrderItem",
            currencyPath: "/UI_CURRENCYEXCHANGERATE/I_Currency?$top=200",
            segmentPath: "/MD_PRODUCT_OP_SRV/C_ProductObjPgSalesOrder",

            dashboard: {
                accrualApiPath: "/ZBTP_HYPERAUTOMATION_SERVICES_SRV/AccrualsSet",
                recallApiPath: "/http/Accrual/Process"
            },

            auth: {
                uaa: {
                    url: "https://s4-quality-3agj10mg.authentication.eu20.hana.ondemand.com",
                    clientId: "sb-9bb2c7bd-674a-47ff-9bc9-7de79c22968d!b76255|xsuaa!b47942",
                    clientSecret: "ccf3884d-caad-4602-8399-0b1f5b2b9cbe$7SafUTzHfkF6jWhVOr5cwYXHxYPjxhExRozHld0DKG4="
                },
                dms: {
                    repositoryId: "414c14fb-8265-47c8-9e05-d9cbb46df57f",
                    clientId: "sb-0b07ab86-da06-48c2-aaff-cd70c3986dde!b69304|sdm-di-DocumentManagement-sdm_integration!b873",
                    clientSecret: "e54bee4d-305a-4b5a-bfd3-fcdb7154dc35$wrq9Ite3DTvTUTeCKfK_gbBeJy9sBdU39JKWTNfk-LM=",
                    tokenUrl: "https://development-zce2p8yp.authentication.eu20.hana.ondemand.com/oauth/token"
                }
            },

            processAutomation: {
                definitionId: "us10.e84e1793trial.infineumaccrual4.accrual_Process"
            }

        },

//------------------------  Production --------------------------------------------

        PRD: {

            apiHost: "https://is-apim-prd.test01.apimanagement.eu20.hana.ondemand.com",

            credentials: {
                username: "PRD_USERNAME",
                password: "PRD_PASSWORD"
            },

            workflowServicePath: "/ZBTP_HYPERAUTOMATION_SERVICES_SRV",
            workflowInstancePath: "/public/workflow/rest/v1/workflow-instances",
            taskInstancePath: "/public/workflow/rest/v1/task-instances",

            businessPartnerPath: "/API_BUSINESS_PARTNER",
            companyCodePath: "/C_COMPANYCODEVALUEHELPPROJ_CDS/C_CompanyCodeValueHelpProj",
            glAccountPath: "/C_GLACCOUNTVALUEHELP_CDS/C_GLAccountValueHelp",
            purchaseOrderPath: "/C_PURCHASEORDER_FS_SRV/C_PurchaseOrderFs",
            purchaseOrderItemPath: "/C_PURCHASEORDER_FS_SRV/I_PurchaseOrderItem",

            costCentrePath: "/FCO_MANAGE_COST_CENTERS_SRV/C_CostCenter",
            internalOrderPath: "/FCO_INTERNAL_ORDER_SRV/InternalOrderSet",
            salesOrderPath: "/API_SALES_ORDER_SRV/A_SalesOrderItem",
            currencyPath: "/UI_CURRENCYEXCHANGERATE/I_Currency?$top=200",
            segmentPath: "/MD_PRODUCT_OP_SRV/C_ProductObjPgSalesOrder",

            dashboard: {
                accrualApiPath: "/ZBTP_HYPERAUTOMATION_SERVICES_SRV/AccuralsSet",
                recallApiPath: "/http/Accrual/Process"
            },

            auth: {
                uaa: {
                    url: "PRD_UAA_URL",
                    clientId: "PRD_CLIENT_ID",
                    clientSecret: "PRD_CLIENT_SECRET"
                },
                dms: {
                    repositoryId: "PRD_REPOSITORY_ID",
                    clientId: "PRD_DMS_CLIENT_ID",
                    clientSecret: "PRD_DMS_CLIENT_SECRET",
                    tokenUrl: "PRD_DMS_TOKEN_URL"
                }
            },

            processAutomation: {
                definitionId: "prd.accrual_Process"
            }

        }

    };

    function joinUrl(host, path) {
        return String(host).replace(/\/$/, "") + String(path);
    }

    var env = CONFIG[Environment.CURRENT];

    var username = env.credentials.username;
    var password = env.credentials.password;

    return {

        workflowLogs: {
            baseUrl: joinUrl(env.apiHost, env.workflowServicePath),
            username: username,
            password: password
        },

        instance: {
            baseEndpoint: joinUrl(env.apiHost, env.workflowInstancePath),
            username: username,
            password: password
        },

        taskInstance: {
            baseEndpoint: joinUrl(env.apiHost, env.taskInstancePath),
            username: username,
            password: password
        },

        businessPartner: {
            baseEndpoint: joinUrl(env.apiHost, env.businessPartnerPath),
            username: username,
            password: password
        },

        companyCode: {
            apiEndpoint: joinUrl(env.apiHost, env.companyCodePath),
            username: username,
            password: password
        },

        glAccount: {
            apiEndpoint: joinUrl(env.apiHost, env.glAccountPath),
            username: username,
            password: password
        },

        purchaseOrder: {
            apiEndpoint: joinUrl(env.apiHost, env.purchaseOrderPath),
            username: username,
            password: password
        },

        purchaseOrderItem: {
            apiEndpoint: joinUrl(env.apiHost, env.purchaseOrderItemPath),
            username: username,
            password: password
        },

        costCentre: {
            apiEndpoint: joinUrl(env.apiHost, env.costCentrePath),
            username: username,
            password: password
        },

        internalOrder: {
            apiEndpoint: joinUrl(env.apiHost, env.internalOrderPath),
            username: username,
            password: password
        },

        salesOrder: {
            apiEndpoint: joinUrl(env.apiHost, env.salesOrderPath),
            username: username,
            password: password
        },

        currency: {
            apiEndpoint: joinUrl(env.apiHost, env.currencyPath),
            username: username,
            password: password
        },

        segment: {
            apiEndpoint: joinUrl(env.apiHost, env.segmentPath),
            username: username,
            password: password
        },

        dashboard: {
            accrualApiEndpoint: joinUrl(env.apiHost, env.dashboard.accrualApiPath),
            recallApiEndpoint: joinUrl(env.apiHost, env.dashboard.recallApiPath),
            username: username,
            password: password
        },

        processAutomation: {
            definitionId: env.processAutomation.definitionId,
            apiEndpoint: joinUrl(env.apiHost, env.workflowInstancePath),
            uaaConfig: env.auth.uaa
        },

        dms: {
            baseUrl: env.apiHost,
            repositoryId: env.auth.dms.repositoryId,
            clientId: env.auth.dms.clientId,
            clientSecret: env.auth.dms.clientSecret,
            tokenUrl: env.auth.dms.tokenUrl,
            endpoints: function () {
                var base = this.baseUrl;
                var repo = this.repositoryId;
                return {
                    getObject: base + "/GetObject/browser/" + repo + "/root",
                    createFolder: base + "/CreateFolder/browser/" + repo + "/root",
                    createDocument: base + "/Createdocument/browser/" + repo + "/root",
                    download: base + "/Download/browser/" + repo + "/root",
                    delete: base + "/delete/browser/" + repo + "/root"
                };
            }
        }

    };

});

