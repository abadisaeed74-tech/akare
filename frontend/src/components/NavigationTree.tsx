import React, { useEffect, useState } from 'react';
import { Tree, Spin, message, Button, Modal, Tooltip } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { getCities, getNeighborhoods, deletePropertiesByCity, deletePropertiesByNeighborhood } from '../services/api';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';

interface NavigationTreeProps {
    onSelect: (type: 'city' | 'neighborhood' | 'all', key: string) => void;
    reloadKey?: number;
}

const NavigationTree: React.FC<NavigationTreeProps> = ({ onSelect, reloadKey }) => {
    const [treeData, setTreeData] = useState<DataNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [showDelete, setShowDelete] = useState(false);

    const normalizeLabel = (value: string | null | undefined): string => {
        if (!value) return '';
        return value.trim();
    };

    const buildTree = async () => {
        setLoading(true);
        try {
            const citiesResponse = await getCities();
            // Normalize and deduplicate city names
            const normalizedCities = Array.from(
                new Set(
                    citiesResponse
                        .map((c) => normalizeLabel(c))
                        .filter((c) => c.length > 0)
                )
            );

            const cityNodes: DataNode[] = await Promise.all(
                normalizedCities.map(async (city) => {
                    const neighborhoodsResponse = await getNeighborhoods(city);
                    const normalizedNeighborhoods = Array.from(
                        new Set(
                            neighborhoodsResponse
                                .map((n) => normalizeLabel(n))
                                .filter((n) => n.length > 0)
                        )
                    );

                    const neighborhoodNodes: DataNode[] = normalizedNeighborhoods.map((neighborhood) => ({
                        title: neighborhood,
                        key: `neighborhood-${city}-${neighborhood}`, // ensure uniqueness across cities
                        isLeaf: true,
                    }));
                    return {
                        title: city,
                        key: `city-${city}`,
                        children: neighborhoodNodes,
                    };
                })
            );

            setTreeData([
                {
                    title: 'جميع العقارات',
                    key: 'all',
                    children: cityNodes,
                },
            ]);
        } catch (error) {
            message.error('فشل في تحميل شجرة التصفح.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        buildTree();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reloadKey]);

    const handleDeleteBranch = (node: any, e: React.MouseEvent) => {
        e.stopPropagation();
        const key = String(node.key);
        const [type, ...rest] = key.split('-');

        if (type === 'all') {
            message.warning('لا يمكن حذف جميع العقارات من هنا.');
            return;
        }

        if (type === 'city') {
            const city = rest.join('-');
            Modal.confirm({
                title: 'حذف مدينة كاملة',
                content: `هل أنت متأكد من حذف جميع العروض في مدينة "${city}"؟ لا يمكن التراجع عن هذه العملية.`,
                okText: 'حذف',
                cancelText: 'إلغاء',
                okButtonProps: { danger: true },
                onOk: async () => {
                    try {
                        await deletePropertiesByCity(city);
                        message.success('تم حذف جميع العروض لهذه المدينة.');
                        await buildTree();
                    } catch (error: any) {
                        const detail = error?.response?.data?.detail || 'فشل في حذف العروض لهذه المدينة.';
                        message.error(`خطأ: ${detail}`);
                    }
                },
            });
            return;
        }

        if (type === 'neighborhood') {
            const [city, ...nhParts] = rest;
            const neighborhood = nhParts.join('-');
            Modal.confirm({
                title: 'حذف حي كامل',
                content: `هل أنت متأكد من حذف جميع العروض في حي "${neighborhood}"${city ? ` بمدينة "${city}"` : ''}؟ لا يمكن التراجع عن هذه العملية.`,
                okText: 'حذف',
                cancelText: 'إلغاء',
                okButtonProps: { danger: true },
                onOk: async () => {
                    try {
                        await deletePropertiesByNeighborhood(city || null, neighborhood);
                        message.success('تم حذف جميع العروض لهذا الحي.');
                        await buildTree();
                    } catch (error: any) {
                        const detail = error?.response?.data?.detail || 'فشل في حذف العروض لهذا الحي.';
                        message.error(`خطأ: ${detail}`);
                    }
                },
            });
        }
    };

    const handleSelect = (selectedKeys: React.Key[]) => {
        if (selectedKeys.length === 0) return;
        const key = selectedKeys[0] as string;
        const [type, ...rest] = key.split('-');

        if (type === 'all') {
            onSelect('all', 'all');
            return;
        }

        if (type === 'city') {
            const city = rest.join('-');
            onSelect('city', city);
            return;
        }

        if (type === 'neighborhood') {
            // key format: neighborhood-<city>-<neighborhood>
            const [, ...nhParts] = rest;
            const neighborhood = nhParts.join('-');
            onSelect('neighborhood', neighborhood);
            return;
        }
    };

    if (loading) {
        return <Spin style={{ padding: '24px', display: 'block' }} />;
    }

    return (
        <div>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0 8px 8px',
                }}
            >
                <span style={{ fontSize: 12, color: '#888' }}>شجرة المدن والأحياء</span>
                <Tooltip title={showDelete ? 'إخفاء أزرار الحذف' : 'إظهار أزرار الحذف'}>
                    <Button
                        type={showDelete ? 'primary' : 'text'}
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => setShowDelete((prev) => !prev)}
                    />
                </Tooltip>
            </div>
            <Tree
                showLine
                defaultExpandAll
                onSelect={handleSelect}
                treeData={treeData}
                titleRender={(node) => {
                    if (node.key === 'all') {
                        return <span>{node.title as React.ReactNode}</span>;
                    }
                    return (
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}
                        >
                            <span>{node.title as React.ReactNode}</span>
                            {showDelete && (
                                <Tooltip title="حذف جميع العروض في هذا الفرع">
                                    <Button
                                        type="text"
                                        danger
                                        size="small"
                                        icon={<DeleteOutlined />}
                                        onClick={(e) => handleDeleteBranch(node, e)}
                                    />
                                </Tooltip>
                            )}
                        </div>
                    );
                }}
                style={{ background: '#fff' }}
            />
        </div>
    );
};

export default NavigationTree;
