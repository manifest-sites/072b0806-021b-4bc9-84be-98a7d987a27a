import { useState, useEffect } from 'react'
import { Card, Button, Input, Select, Modal, Form, InputNumber, Switch, Row, Col, Space, Typography, Tag, Avatar, Empty } from 'antd'
import { PlusOutlined, SearchOutlined, HeartOutlined, HeartFilled, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { Dog } from '../entities/Dog'

const { Title, Text, Paragraph } = Typography
const { Option } = Select
const { TextArea } = Input

function DogApp() {
  const [dogs, setDogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterBreed, setFilterBreed] = useState('')
  const [filterAdopted, setFilterAdopted] = useState('')
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [editingDog, setEditingDog] = useState(null)
  const [form] = Form.useForm()

  const breeds = ['Labrador', 'Golden Retriever', 'German Shepherd', 'Bulldog', 'Poodle', 'Beagle', 'Rottweiler', 'Yorkshire Terrier', 'Dachshund', 'Siberian Husky', 'Mixed Breed', 'Other']

  useEffect(() => {
    loadDogs()
  }, [])

  const loadDogs = async () => {
    setLoading(true)
    try {
      const response = await Dog.list()
      if (response.success) {
        setDogs(response.data)
      }
    } catch (error) {
      console.error('Error loading dogs:', error)
    }
    setLoading(false)
  }

  const handleAddEdit = async (values) => {
    try {
      if (editingDog) {
        const response = await Dog.update(editingDog._id, values)
        if (response.success) {
          setDogs(dogs.map(dog => dog._id === editingDog._id ? response.data : dog))
        }
      } else {
        const response = await Dog.create(values)
        if (response.success) {
          setDogs([...dogs, response.data])
        }
      }
      setIsModalVisible(false)
      setEditingDog(null)
      form.resetFields()
    } catch (error) {
      console.error('Error saving dog:', error)
    }
  }

  const handleEdit = (dog) => {
    setEditingDog(dog)
    form.setFieldsValue(dog)
    setIsModalVisible(true)
  }

  const handleDelete = async (dogId) => {
    // Note: Delete functionality would need to be implemented in the backend
    // For now, we'll just remove from local state
    setDogs(dogs.filter(dog => dog._id !== dogId))
  }

  const filteredDogs = dogs.filter(dog => {
    const matchesSearch = dog.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         dog.breed.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesBreed = !filterBreed || dog.breed === filterBreed
    const matchesAdopted = filterAdopted === '' || 
                          (filterAdopted === 'adopted' && dog.isAdopted) ||
                          (filterAdopted === 'available' && !dog.isAdopted)
    
    return matchesSearch && matchesBreed && matchesAdopted
  })

  const getDogAvatar = (dog) => {
    const colors = ['#ff4500', '#8b00ff', '#ffd700', '#00ced1', '#32cd32', '#ff1493', '#ff6347', '#9370db', '#00fa9a', '#ff8c00']
    const colorIndex = dog.name.length % colors.length
    return colors[colorIndex]
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-100 via-purple-100 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 text-center">
          <Title level={1} className="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600">🐕 Dog Adoption Center</Title>
          <Text type="secondary" className="text-lg">Find your perfect furry friend</Text>
        </div>

        <div className="mb-6 bg-gradient-to-r from-yellow-50 to-orange-50 p-4 rounded-lg shadow-lg border border-yellow-200">
          <Row gutter={[16, 16]} align="middle">
            <Col xs={24} sm={8}>
              <Input
                placeholder="Search dogs by name or breed..."
                prefix={<SearchOutlined />}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </Col>
            <Col xs={24} sm={6}>
              <Select
                placeholder="Filter by breed"
                value={filterBreed}
                onChange={setFilterBreed}
                allowClear
                className="w-full"
              >
                {breeds.map(breed => (
                  <Option key={breed} value={breed}>{breed}</Option>
                ))}
              </Select>
            </Col>
            <Col xs={24} sm={6}>
              <Select
                placeholder="Adoption status"
                value={filterAdopted}
                onChange={setFilterAdopted}
                allowClear
                className="w-full"
              >
                <Option value="available">Available</Option>
                <Option value="adopted">Adopted</Option>
              </Select>
            </Col>
            <Col xs={24} sm={4}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setIsModalVisible(true)}
                className="w-full"
              >
                Add Dog
              </Button>
            </Col>
          </Row>
        </div>

        {filteredDogs.length === 0 ? (
          <Empty
            description="No dogs found"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            className="mt-12"
          />
        ) : (
          <Row gutter={[16, 16]}>
            {filteredDogs.map(dog => (
              <Col xs={24} sm={12} lg={8} xl={6} key={dog._id}>
                <Card
                  hoverable
                  className="h-full"
                  cover={
                    <div className="h-48 bg-gradient-to-br from-cyan-200 via-pink-200 to-yellow-200 flex items-center justify-center">
                      <Avatar
                        size={80}
                        src={`https://api.dicebear.com/7.x/bottts/svg?seed=${dog.name}`}
                        style={{ backgroundColor: getDogAvatar(dog) }}
                      />
                    </div>
                  }
                  actions={[
                    dog.isAdopted ? <HeartFilled style={{ color: '#ff1493' }} /> : <HeartOutlined style={{ color: '#ff69b4' }} />,
                    <EditOutlined onClick={() => handleEdit(dog)} />,
                    <DeleteOutlined onClick={() => handleDelete(dog._id)} />
                  ]}
                >
                  <Card.Meta
                    title={
                      <div className="flex items-center justify-between">
                        <span>{dog.name}</span>
                        <Tag color={dog.isAdopted ? 'magenta' : 'cyan'}>
                          {dog.isAdopted ? 'Adopted' : 'Available'}
                        </Tag>
                      </div>
                    }
                    description={
                      <Space direction="vertical" size="small" className="w-full">
                        <Text><strong>Breed:</strong> {dog.breed}</Text>
                        <Text><strong>Age:</strong> {dog.age} years</Text>
                        <Text><strong>Weight:</strong> {dog.weight} lbs</Text>
                        <Text><strong>Color:</strong> {dog.color}</Text>
                        {dog.personality && (
                          <Text type="secondary">{dog.personality}</Text>
                        )}
                        {dog.isAdopted && dog.ownerName && (
                          <Text type="success"><strong>Owner:</strong> {dog.ownerName}</Text>
                        )}
                      </Space>
                    }
                  />
                </Card>
              </Col>
            ))}
          </Row>
        )}

        <Modal
          title={editingDog ? 'Edit Dog' : 'Add New Dog'}
          open={isModalVisible}
          onCancel={() => {
            setIsModalVisible(false)
            setEditingDog(null)
            form.resetFields()
          }}
          footer={null}
          width={600}
        >
          <Form
            form={form}
            layout="vertical"
            onFinish={handleAddEdit}
            className="mt-4"
          >
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="name"
                  label="Name"
                  rules={[{ required: true, message: 'Please enter the dog\'s name' }]}
                >
                  <Input placeholder="Enter dog's name" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="breed"
                  label="Breed"
                  rules={[{ required: true, message: 'Please select the breed' }]}
                >
                  <Select placeholder="Select breed">
                    {breeds.map(breed => (
                      <Option key={breed} value={breed}>{breed}</Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={8}>
                <Form.Item
                  name="age"
                  label="Age (years)"
                  rules={[{ required: true, message: 'Please enter the age' }]}
                >
                  <InputNumber min={0} max={30} className="w-full" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  name="weight"
                  label="Weight (lbs)"
                >
                  <InputNumber min={0} max={300} className="w-full" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  name="color"
                  label="Color"
                >
                  <Input placeholder="Primary color" />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item
              name="personality"
              label="Personality"
            >
              <Input placeholder="e.g., Friendly, energetic, calm" />
            </Form.Item>

            <Form.Item
              name="notes"
              label="Additional Notes"
            >
              <TextArea rows={3} placeholder="Any additional information about the dog" />
            </Form.Item>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="isAdopted"
                  label="Adoption Status"
                  valuePropName="checked"
                >
                  <Switch checkedChildren="Adopted" unCheckedChildren="Available" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="ownerName"
                  label="Owner Name"
                  dependencies={['isAdopted']}
                  rules={[
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (getFieldValue('isAdopted') && !value) {
                          return Promise.reject(new Error('Please enter the owner\'s name for adopted dogs'))
                        }
                        return Promise.resolve()
                      }
                    })
                  ]}
                >
                  <Input placeholder="Owner's name (if adopted)" />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item className="mb-0 text-right">
              <Space>
                <Button onClick={() => {
                  setIsModalVisible(false)
                  setEditingDog(null)
                  form.resetFields()
                }}>
                  Cancel
                </Button>
                <Button type="primary" htmlType="submit">
                  {editingDog ? 'Update' : 'Add'} Dog
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </div>
  )
}

export default DogApp