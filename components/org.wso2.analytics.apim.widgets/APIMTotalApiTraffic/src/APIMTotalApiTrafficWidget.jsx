/*
 *  Copyright (c) 2020, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
 *
 *  WSO2 Inc. licenses this file to you under the Apache License,
 *  Version 2.0 (the "License"); you may not use this file except
 *  in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing,
 *  software distributed under the License is distributed on an
 *  "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 *  KIND, either express or implied.  See the License for the
 *  specific language governing permissions and limitations
 *  under the License.
 *
 */

import React from 'react';
import {
    defineMessages, IntlProvider, FormattedMessage, addLocaleData,
} from 'react-intl';
import Axios from 'axios';
import cloneDeep from 'lodash/cloneDeep';
import { MuiThemeProvider, createMuiTheme } from '@material-ui/core/styles';
import Paper from '@material-ui/core/Paper';
import Typography from '@material-ui/core/Typography';
import Widget from '@wso2-dashboards/widget';
import APIMTotalApiTraffic from './APIMTotalApiTraffic';

const darkTheme = createMuiTheme({
    palette: {
        type: 'dark',
    },
    typography: {
        useNextVariants: true,
    },
});

const lightTheme = createMuiTheme({
    palette: {
        type: 'light',
    },
    typography: {
        useNextVariants: true,
    },
});

/**
 * Query parameter key
 * @type {string}
 */
const queryParamKey = 'recentApiTraffic';

/**
 * Language
 * @type {string}
 */
const language = (navigator.languages && navigator.languages[0]) || navigator.language || navigator.userLanguage;

/**
 * Language without region code
 */
const languageWithoutRegionCode = language.toLowerCase().split(/[_-]+/)[0];

/**
 * Widget to display API Total traffic
 * @class APIMTotalApiTrafficWidget
 * @extends {Widget}
 */
class APIMTotalApiTrafficWidget extends Widget {
    /**
     * Creates an instance of APIMTotalApiTrafficWidget.
     * @param {any} props @inheritDoc
     * @memberof APIMTotalApiTrafficWidget
     */
    constructor(props) {
        super(props);
        this.styles = {
            paper: {
                padding: '5%',
                border: '2px solid #4555BB',
            },
            paperWrapper: {
                margin: 'auto',
                width: '50%',
                marginTop: '20%',
            },
        };

        this.state = {
            width: this.props.width,
            height: this.props.height,
            usageData: [],
            localeMessages: null,
            limit: 5,
            inProgress: true,
        };

        // This will re-size the widget when the glContainer's width is changed.
        if (this.props.glContainer !== undefined) {
            this.props.glContainer.on('resize', () => this.setState({
                width: this.props.glContainer.width,
                height: this.props.glContainer.height,
            }));
        }

        this.assembleApiUsageQuery = this.assembleApiUsageQuery.bind(this);
        this.handleApiUsageReceived = this.handleApiUsageReceived.bind(this);
        this.handlePublisherParameters = this.handlePublisherParameters.bind(this);
        this.loadLocale = this.loadLocale.bind(this);
        this.handleLimitChange = this.handleLimitChange.bind(this);
        this.setCurrentApi = this.setCurrentApi.bind(this);
    }

    componentWillMount() {
        const locale = (languageWithoutRegionCode || language || 'en');
        this.loadLocale(locale).catch(() => {
            this.loadLocale().catch(() => {
                // TODO: Show error message.
            });
        });
    }

    componentDidMount() {
        const { widgetID } = this.props;
        super.getWidgetConfiguration(widgetID)
            .then((message) => {
                this.setState({
                    providerConfig: message.data.configs.providerConfig,
                }, () => super.subscribe(this.handlePublisherParameters));
            })
            .catch((error) => {
                console.error("Error occurred when loading widget '" + widgetID + "'. " + error);
                this.setState({
                    faultyProviderConfig: true,
                });
            });
    }

    componentWillUnmount() {
        const { id } = this.props;
        super.getWidgetChannelManager().unsubscribeWidget(id);
    }

    /**
      * Load locale file
      * @param {string} locale Locale name
      * @memberof APIMTotalApiTrafficWidget
      * @returns {string}
      */
    loadLocale(locale = 'en') {
        return new Promise((resolve, reject) => {
            Axios
                .get(`${window.contextPath}/public/extensions/widgets/APIMTotalApiTraffic/locales/${locale}.json`)
                .then((response) => {
                    // eslint-disable-next-line global-require, import/no-dynamic-require
                    addLocaleData(require(`react-intl/locale-data/${locale}`));
                    this.setState({ localeMessages: defineMessages(response.data) });
                    resolve();
                })
                .catch(error => reject(error));
        });
    }

    /**
     * set limit to the query parameter key
     * @param {string} limit data display limit
     * @memberof APIMTotalApiTrafficWidget
     */
    updateQueryParamsInURL() {
        const limit = parseInt(this.state.limit, 10);
        const { api } = this.state;
        super.setGlobalState(queryParamKey, { limit, api });
    }

    /**
     * Retrieve params from publisher - DateTimeRange
     * @param {object} receivedMsg timeFrom, TimeTo, perValue
     * @memberof APIMTotalApiTrafficWidget
    */
    handlePublisherParameters(receivedMsg) {
        const queryParam = super.getGlobalState('dtrp');
        const { sync } = queryParam;
        this.setState({
            timeFrom: receivedMsg.from,
            timeTo: receivedMsg.to,
            perValue: receivedMsg.granularity,
            inProgress: !sync,
        }, this.assembleApiUsageQuery);
    }

    /**
     * Retreive traffic data for APIs
     * @memberof APIMTotalApiTrafficWidget
     */
    assembleApiUsageQuery() {
        const {
            timeFrom, timeTo, perValue, providerConfig,
        } = this.state;
        const { id, widgetID: widgetName } = this.props;
        const queryParam = super.getGlobalState(queryParamKey);
        let { limit } = queryParam;

        if (!limit || limit < 0) {
            limit = 5;
        }
        const dataProviderConfigs = cloneDeep(providerConfig);
        dataProviderConfigs.configs.config.queryData.queryName = 'apiusagequery';
        dataProviderConfigs.configs.config.queryData.queryValues = {
            '{{from}}': timeFrom,
            '{{to}}': timeTo,
            '{{per}}': perValue,
            '{{limit}}': limit,
        };
        super.getWidgetChannelManager()
            .subscribeWidget(id, widgetName, this.handleApiUsageReceived, dataProviderConfigs);
    }

    /**
     * Formats data retrieved from assembleApiUsageQuery
     * @param {object} message - data retrieved
     * @memberof APIMTotalApiTrafficWidget
     * */
    handleApiUsageReceived(message) {
        const { data } = message;
        if (data) {
            const usageData = [];

            data.forEach(([api, version, success = 0, throttled = 0, faulted = 0]) => {
                usageData.push({
                    API: `${api}(${version})`,
                    Traffic: success + throttled + faulted,
                    apiId: api,
                    apiVersion: version,
                });
            });
            this.setState({ usageData, inProgress: false });
        }
    }

    /**
     * Handle API Data display limit
     * @param {Event} event - listened event
     * @memberof APIMTotalApiTrafficWidget
     * */
    handleLimitChange(event) {
        const { id } = this.props;
        const limit = (event.target.value).replace('-', '').split('.')[0];
        if (limit) {
            this.setState({ inProgress: false });
            super.getWidgetChannelManager().unsubscribeWidget(id);
            this.assembleApiUsageQuery();
        }
        this.setState({ limit, inProgress: true }, () => {
            this.updateQueryParamsInURL();
            this.assembleApiUsageQuery();
        });
    }

    /**
     *
     * @param {String} api - API Name
     */
    setCurrentApi(api) {
        this.setState({
            api,
        });
        this.updateQueryParamsInURL();
    }

    /**
     * @inheritDoc
     * @returns {ReactElement} Render the APIM Total Api Traffic widget
     * @memberof APIMTotalApiTrafficWidget
     */
    render() {
        const {
            localeMessages, faultyProviderConfig, height, usageData, inProgress, limit,
        } = this.state;
        const {
            paper, paperWrapper,
        } = this.styles;
        const { muiTheme } = this.props;
        const themeName = muiTheme.name;
        const apiUsageProps = {
            themeName, height, usageData, limit, inProgress, ...this.props,
        };

        return (
            <IntlProvider
                locale={language}
                messages={localeMessages}
            >
                <MuiThemeProvider
                    theme={themeName === 'dark' ? darkTheme : lightTheme}
                >
                    {
                        faultyProviderConfig ? (
                            <div style={paperWrapper}>
                                <Paper
                                    elevation={1}
                                    style={paper}
                                >
                                    <Typography
                                        variant='h5'
                                        component='h3'
                                    >
                                        <FormattedMessage
                                            id='config.error.heading'
                                            defaultMessage='Configuration Error !'
                                        />
                                    </Typography>
                                    <Typography component='p'>
                                        <FormattedMessage
                                            id='config.error.body'
                                            defaultMessage={'Cannot fetch provider configuration forAPIM'
                                            + 'Total Api Traffic widget'}
                                        />
                                    </Typography>
                                </Paper>
                            </div>
                        ) : (
                            <APIMTotalApiTraffic
                                {...apiUsageProps}
                                handleLimitChange={this.handleLimitChange}
                                setCurrentApi={this.setCurrentApi}
                            />
                        )
                    }
                </MuiThemeProvider>
            </IntlProvider>
        );
    }
}

global.dashboard.registerWidget('APIMTotalApiTraffic', APIMTotalApiTrafficWidget);
