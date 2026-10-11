from setuptools import find_packages, setup

setup(
    name='sadarakshak',
    version='0.1.0',
    author='Vishal Rajesh Mahajan',
    author_email='vism06@gmail.com',
    description='SADARAKSHAK - Real-Time Road Accident Detection and Monitoring System (YOLO11)',
    long_description=open('README.md').read(),
    long_description_content_type='text/markdown',
    url='https://github.com/VishalRMahajan/Nirikshan-AcciDetect',  
    packages=find_packages(),
    install_requires=[
        'numpy',
        'opencv-python',
        'supervision',
        'av',
        'torch',
        'ultralytics',
        'fastapi',
        'uvicorn',
        'pydantic'
    ],
    classifiers=[
        'Programming Language :: Python :: 3',
        'Operating System :: OS Independent',
    ],
    python_requires='>=3.6',
)